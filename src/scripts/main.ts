import { Component } from "nils-library";
import { InspirationElement } from "./inspiration-element.js";
import type { ChatMessageV11 } from "./types/types.js";

type JQuery = Array<HTMLElement>;

Hooks.on('renderChatMessage', (msg: ChatMessageV11, html: HTMLElement | JQuery, renderData: Readonly<object>) => {
  if (!(html instanceof HTMLElement)) {
    html = html[0];
  }

  const diceRoll = html.querySelector('.dice-roll');
  if (diceRoll) {
    diceRoll.insertAdjacentElement('afterend', document.createElement(Component.getTag(InspirationElement)));
  }
});