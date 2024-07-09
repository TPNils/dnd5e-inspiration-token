import { ActorV11, ChatMessageV11 } from "./types/types";
import { UtilsLog } from "./utils-log.js";

interface RenderState {
  playerType: 'player' | 'gm',
  hasInspiration: boolean,
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

    cursor: pointer;
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

  .inspiration.active::after {
    content: "";
    width: calc(var(--size) / 4 - 1px);
    height: calc(var(--size) / 4 - 1px);
    background: white;
    transform: rotate(45deg);
    box-shadow: 0 0 8px 3px var(--color-shadow-highlight);
  }
  
  .player {
    background-color: #EFE;
    border: 1px solid #DDD;
    color: #999;
  }

  .player:hover {
    background-color: rgb(166, 219, 166);
    border-color: rgb(60, 151, 9);
    color: rgb(85, 85, 85);
  }

  .gm {
    background-color: #FEE;
    border: 1px solid #EDD;
    color: #A66;
  }

  .gm:hover {
    background-color: rgb(245, 214, 214);
    border-color: #D06767;
  }
`);
UtilsLog.debug(String(styleSheet))

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

  #renderStateChanged = false;
  #renderState: RenderState | null = null;
  #startRender(): Promise<void> {
    const msgId = this.closest(`[data-message-id]`)?.getAttribute('data-message-id');
    if (!msgId) {
      this.#calcRenderState();
      this.#execRender();
      return;
    }
    const msg: ChatMessageV11 = game.messages.get(msgId) as any;
    if (!msg) {
      this.#calcRenderState(msg);
      this.#execRender();
      return;
    }

    const actor: ActorV11 = game.scenes.get(msg.speaker.scene)?.tokens?.get(msg.speaker.token)?.actor || game.actors.get(msg.speaker.actor);
    if (!actor) {
      this.#calcRenderState(msg, actor);
      this.#execRender();
      return;
    }

    this.#calcRenderState(msg, actor);
    this.#execRender();
  }

  /** @returns true if the state changed */
  #calcRenderState(msg?: ChatMessageV11, actor?: ActorV11): void {
    let newState: RenderState;
    if (msg == null || actor == null) {
      newState = null;
    } else if (!actor.testUserPermission(game.user, 'OBSERVER')) {
      newState = null;
    } else if (!msg.rolls.find(roll => roll.terms.find(term => term instanceof DiceTerm && term.faces === 20 && term.number > 0))) {
      newState = null;
    } else {
      newState = {
        playerType: game.user.isGM ? 'gm' : 'player',
        hasInspiration: !!actor.system.attributes.inspiration,
      }
    }

    this.#renderStateChanged = this.#renderStateChanged || !objectsEqual(this.#renderState, newState)
    this.#renderState = newState;
  }

  #shadow: ShadowRoot;
  #execRender(): void {
    // UtilsLog.debug({renderStateChanged: this.#renderStateChanged, renderState: this.#renderState})
    if (!this.#renderStateChanged) {
      return;
    }
    if (this.#shadow == null) {
      this.#shadow = this.attachShadow({mode: 'closed'});
      this.#shadow.adoptedStyleSheets = [styleSheet];
    }
    this.#shadow.innerHTML = '';
    // this.#shadow.append(new DOMParser().parseFromString(`<pre>renderState: ${JSON.stringify(this.#renderState, null, 2)}</pre>`, 'text/html').querySelector('pre'))

    switch (this.#renderState.playerType) {
      case 'gm': {
        if (!this.#renderState.hasInspiration) {
          this.#shadow.append(new DOMParser().parseFromString(/*html*/`
            <div class="wrapper gm">
              Reactivate inspiration & reroll highest d20
              <span class="inspiration"></span>
            </div>
          `, 'text/html').querySelector('.wrapper'));
        }
        break;
      }
      case 'player': {
        if (this.#renderState.hasInspiration) {
          this.#shadow.append(new DOMParser().parseFromString(/*html*/`
            <div class="wrapper player">
              Consume inspiration & reroll lowest d20
              <span class="inspiration active"></span>
            </div>
          `, 'text/html').querySelector('.wrapper'));
        }
        break;
      }
    }

    this.#renderStateChanged = false;
  }

}

customElements.define(InspirationElement.tag, InspirationElement);