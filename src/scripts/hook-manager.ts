import type { Stoppable } from "nils-library";
import type { ActorV11, ChatMessageV11 } from "./types/types";

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

/**
 * Existence reason: Foundry logs every time a hook is registered
 * So only register the hooks once and distribute them
 */
export class HookManager {

  public static updateActor(cb: PostUpdateActorCb): Stoppable {
    return actorCallbacks.register(cb);
  }

  public static updateChatMessage(cb: PostUpdateChatMessageCb): Stoppable {
    return chatMessageCallbacks.register(cb);
  }

}