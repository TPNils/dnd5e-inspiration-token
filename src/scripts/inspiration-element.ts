import { UtilsRoll } from "./rolling/utils-roll.js";
import type { ActorV11, ChatMessageV11 } from "./types/types";
import { UtilsLog } from "./utils-log.js";

interface RenderState {
  playerType: 'player' | 'gm';
  hasInspiration: boolean;
  canInteract: boolean;
  toggledTo: boolean | null | undefined;
};

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/*css*/`
  .wrapper {
    position: relative;
    width: auto;
    height: auto;
    padding: 10px;
    margin-top: 0.25rem;
    line-height: 1.8;
    border-radius: 5px;
    
    text-align: center;
    font-size: var(--font-size-11);
    font-family: var(--dnd5e-font-roboto);
  }
  
  .wrapper.active {
    background-color: #EFE;
    border: 1px solid #DDD;
    color: #999;
  }
  .wrapper:not(.active) {
    background-color: #FEE;
    border: 1px solid #EDD;
    color: #A66;
  }

  .wrapper.interactive {
    cursor: pointer;
  }

  .wrapper.interactive.active:hover {
    background-color: rgb(166, 219, 166);
    border-color: rgb(60, 151, 9);
    color: rgb(85, 85, 85);
  }

  .wrapper.interactive:not(.active):hover {
    background-color: rgb(245, 214, 214);
    border-color: #D06767;
  }

  .inspiration {
    --size: calc(var(--font-size-11) * 2);
    padding: 0;
    position: absolute;
    left: 0;
    top: 50%;
    width: var(--size);
    height: var(--size);
    background: transparent url("/systems/dnd5e/ui/inspiration.webp") no-repeat center / contain;
    filter: drop-shadow(0 3px 4px var(--dnd5e-shadow-45));
    display: grid;
    place-content: center;
    transform: translate(-25%, -50%);
  }

  .active .inspiration::after {
    content: "";
    width: calc(var(--size) / 4 - 1px);
    height: calc(var(--size) / 4 - 1px);
    background: white;
    transform: rotate(45deg);
    box-shadow: 0 0 8px 3px var(--color-shadow-highlight);
  }
`);

interface Stoppable {
  stop: () => void;
}

class CallbackGroup<T extends Function> {
  #nextId = 0;
  #callbacks = new Map<number, T>();
  
  public register(callback: T): Stoppable {
    const id = this.#nextId++;
    this.#callbacks.set(id, callback);

    return this.#getIUnregisterTrigger(id);
  }

  public getCallbacks(): Array<T> {
    const callbackIds = Array.from(this.#callbacks.keys()).sort();
    const callbacks = [];
    for (const callbackId of callbackIds) {
      callbacks.push(this.#callbacks.get(callbackId));
    }
    return callbacks;
  }

  public isEmpty(): boolean {
    return this.#callbacks.size === 0;
  }
  
  #getIUnregisterTrigger(id: number): Stoppable {
    return {
      stop: () => {
        this.#callbacks.delete(id);
      }
    }
  }
}

type PostUpdateActorCb = (actor: ActorV11, diff: object, options: object, userId: string) => void;
const actorCallbacks = new CallbackGroup<PostUpdateActorCb>();
Hooks.on('updateActor', (...args: Parameters<PostUpdateActorCb>) => {
  for (const cb of actorCallbacks.getCallbacks()) {
    cb(...args);
  }
});

type PostUpdateChatMessageCb = (msg: ChatMessageV11, diff: object, options: object, userId: string) => void;
const chatMessageCallbacks = new CallbackGroup<PostUpdateChatMessageCb>();
Hooks.on('updateChatMessage', (...args: Parameters<PostUpdateChatMessageCb>) => {
  for (const cb of chatMessageCallbacks.getCallbacks()) {
    cb(...args);
  }
});

export class InspirationElement extends HTMLElement {

  public static get tag(): string {
    return 'dnd5e-inspiration-token';
  }


  public static observedAttributes = [''];
  public attributeChangedCallback(name: string, oldValue: string, newValue: string): void {
    this.#startRender();
  }

  /**
   * Invoked each time the custom element is appended into a document-connected element.
   * This will happen each time the node is moved, and may happen before the element's contents have been fully parsed. 
   */
  public connectedCallback(): void {
    this.#startRender();
  }

  #documentListeners: Stoppable[] = [];
  #msg: ChatMessageV11;
  #actor: ActorV11;
  #renderStateChanged = false;
  #renderState: RenderState | null = null;
  #startRender(): Promise<void> {
    this.#msg = null;
    this.#actor = null;
    const msgId = this.closest(`[data-message-id]`)?.getAttribute('data-message-id');
    if (!msgId) {
      this.#calcRenderState();
      this.#execRender();
      return;
    }
    const msg: ChatMessageV11 = game.messages.get(msgId) as any;
    if (!msg) {
      this.#calcRenderState();
      this.#execRender();
      return;
    }

    const actor: ActorV11 = game.scenes.get(msg.speaker.scene)?.tokens?.get(msg.speaker.token)?.actor || game.actors.get(msg.speaker.actor);
    if (!actor) {
      this.#calcRenderState();
      this.#execRender();
      return;
    }

    for (const documentListener of this.#documentListeners) {
      documentListener.stop();
    }

    actorCallbacks.register((cbActor) => {
      if (cbActor.uuid === actor.uuid) {
        this.#actor = cbActor;
        this.#calcRenderState();
        this.#execRender();
      }
    });

    chatMessageCallbacks.register((cbMsg) => {
      if (cbMsg.uuid === actor.uuid) {
        this.#msg = cbMsg;
        this.#calcRenderState();
        this.#execRender();
      }
    });

    this.#msg = msg;
    this.#actor = actor;

    this.#calcRenderState();
    this.#execRender();
  }

  #calcRenderState(): void {
    let newState: RenderState;
    if (this.#msg == null || this.#actor == null) {
      newState = null;
    } else if (!this.#actor.testUserPermission(game.user, 'OBSERVER')) {
      newState = null;
    } else if (this.#actor.type !== 'character') {
      newState = null;
    } else {
      let d20Terms = 0;
      for (const roll of this.#msg.rolls) {
        let pendingTerms = roll.terms;
        while (pendingTerms.length > 0) {
          const processingTerms = pendingTerms;
          pendingTerms = [];
          for (const term of processingTerms) {
            if (term instanceof ParentheticalTerm) {
              pendingTerms.push(...term.dice);
            } else if (term instanceof DiceTerm && term.faces === 20 && term.number > 0) {
              d20Terms++;
            }
          }
        }
      }
      if (d20Terms === 0) {
        newState = null;
      } else {
        newState = {
          playerType: game.user.isGM ? 'gm' : 'player',
          hasInspiration: !!this.#actor.system.attributes.inspiration,
          // Interaction => currently only supports rerolling 1 d20 term, no UI for user selection which d20
          canInteract: d20Terms === 1 && this.#actor.testUserPermission(game.user, 'OWNER') && this.#msg.canUserModify(game.user, 'update'),
          toggledTo: this.#msg.flags?.['dnd5e-inspiration-token']?.['toggledTo'],
        }
      }
    }

    this.#renderStateChanged = this.#renderStateChanged || !objectsEqual(this.#renderState, newState);
    this.#renderState = newState;
  }

  #shadow: ShadowRoot;
  #execRender(): void {
    if (!this.#renderStateChanged) {
      return;
    }
    if (this.#shadow == null) {
      this.#shadow = this.attachShadow({mode: 'closed'});
      this.#shadow.adoptedStyleSheets = [styleSheet];
    }
    this.#shadow.innerHTML = '';
    const stateChanged = this.#renderState.toggledTo != null && (
      (this.#renderState?.playerType === 'gm' && this.#renderState.hasInspiration) ||
      (this.#renderState?.playerType === 'player' && !this.#renderState.hasInspiration)
    )

    const render = stateChanged || 
      (this.#renderState?.playerType === 'gm' && !this.#renderState.hasInspiration) ||
      (this.#renderState?.playerType === 'player' && this.#renderState.hasInspiration)

    const inspired = this.#renderState.hasInspiration;
    UtilsLog.debug(this.#renderState.toggledTo, inspired)
    if (render) {
      this.#shadow.append(new DOMParser().parseFromString(/*html*/`
        <div class="wrapper${(this.#renderState.toggledTo == null ? inspired : !this.#renderState.toggledTo) ? ' active' : ''}${this.#renderState.canInteract && !this.#renderState.toggledTo == null ? ' interactive' : ''}">
          ${this.#renderState.toggledTo == null ? `${inspired ? 'Inspired' : 'Not inspired'}` : `${this.#renderState.toggledTo ? 'Disadvantage imposed' : 'Advantage applied'}`}
          <span class="inspiration"></span>
        </div>
      `, 'text/html').querySelector('.wrapper'));
    }
    
    const interactive = this.#shadow.querySelector('.interactive')
    if (interactive) {
      let disabled = false;
      interactive.addEventListener('click', async () => {
        if (disabled) {
          return;
        }
        try {
          disabled = true;
          const rollIndex = this.#msg.rolls.findIndex(roll => roll.terms.find(term => term instanceof DiceTerm && term.faces === 20 && term.number > 0));
          let newRollFormula: string;
          if (inspired) {
            // Add advantage
            newRollFormula = this.#msg.rolls[rollIndex].formula.replace(/([0-9]*)(d20)(?:(dl?)([0-9]*))?/i, (match, faces, d20, dl, dropLowestNr) => {
              return `${Number(faces)+1}${d20}${dl ? dl + Number(dropLowestNr ?? '1')+1 : 'dl'}`;
            });
          } else {
            // Impose disadvantage
            newRollFormula = this.#msg.rolls[rollIndex].formula.replace(/([0-9]*)(d20)(?:(dh)([0-9]*))?/i, (match, faces, d20, dh, dropHighestNr) => {
              return `${Number(faces)+1}${d20}${dh ? dh + Number(dropHighestNr ?? '1')+1 : 'dh'}`;
            });
          }
          const rolls = [...this.#msg.rolls];
          const modifiedRoll = await UtilsRoll.modifyRoll(this.#msg.rolls[rollIndex], newRollFormula)
          rolls[rollIndex] = modifiedRoll.result;
          await this.#msg.update({rolls: rolls, flags: {['dnd5e-inspiration-token']: {['toggledTo']: !inspired}}});
          await this.#actor.update({system: { attributes: {inspiration: !inspired} } });
          this.#calcRenderState();
          this.#execRender();
        } finally {
          disabled = false;
        }
      })
    }

    this.#renderStateChanged = false;
  }

}

customElements.define(InspirationElement.tag, InspirationElement);