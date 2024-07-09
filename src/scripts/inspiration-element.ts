import { ActorV11, ChatMessageV11 } from "./types/types";
import { UtilsLog } from "./utils-log.js";

interface RenderState {
  playerType: 'player' | 'gm',
  hasInspiration: boolean,
};

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
      this.#calcRenderState(msg, null, actor);
      this.#execRender();
      return;
    }

    const user = (typeof msg.user === 'string' ? game.users.get(msg.user) : msg.user);
    this.#calcRenderState(msg, user, actor);
    this.#execRender();
  }

  /** @returns true if the state changed */
  #calcRenderState(msg?: ChatMessageV11, user?: User, actor?: ActorV11): void {
    let newState: RenderState;
    if (msg == null || user == null || actor == null) {
      newState = null;
    } else if (!actor.testUserPermission(user, 'OBSERVER')) {
      newState = null;
    } else if (!msg.rolls.find(roll => roll.terms.find(term => term instanceof DiceTerm && term.faces === 20 && term.number > 0))) {
      newState = null;
    } else if (!(actor as any).testUserPermission(user, 'OBSERVER')) {
      newState = null;
    } else {
      newState = {
        playerType: user.isGM ? 'gm' : 'player',
        hasInspiration: !!actor.system.attributes.inspiration,
      }
    }

    this.#renderStateChanged = this.#renderStateChanged || Object.keys(diffObject(this.#renderState ?? {}, newState ?? {})).length !== 0;
    this.#renderState = newState;
  }

  #shadow: ShadowRoot;
  #execRender(): void {
    // UtilsLog.debug({renderStateChanged: this.#renderStateChanged, renderState: this.#renderState})
    if (!this.#renderStateChanged) {
      return;
    }
    if (this.#shadow == null) {
      this.#shadow = this.attachShadow({mode: 'closed'})
    }
    
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<pre>renderState: ${JSON.stringify(this.#renderState, null, 2)}</pre>`;

    this.#shadow.innerHTML = '';
    this.#shadow.append(wrapper);
    this.#renderStateChanged = false;
  }

}

customElements.define(InspirationElement.tag, InspirationElement);