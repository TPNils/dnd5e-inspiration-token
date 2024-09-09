import { HookManager } from "./hook-manager.js";
import { UtilsDiceSoNice } from "./rolling/utils-dice-so-nice.js";
import { UtilsRoll } from "./rolling/utils-roll.js";
import type { ActorV11, ChatMessageV11 } from "./types/types.js";
import { BindEvent, Component, Stoppable, OnInit, OnInitParam, Attribute } from "nils-library";

@Component({
  tag: 'dnd5e-inspiration-token',
  useShadowDom: 'closed',
  html: /*html*/`
    <div [class]="this.wrapperClasses" *if="this.showCard">
      <span class="text">{{this.cardText}}</span>
      <span class="inspiration"></span>
    </div>
  `,
  style: /*css*/`
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
`
})
export class InspirationElement implements OnInit {

  private _wrapperClasses = new Set<string>();
  public get wrapperClasses(): string {
    const classes = new Set<string>(this._wrapperClasses);
    classes.add('wrapper');
    return Array.from(classes).join(' ');
  }
  public text = '';

  @Attribute({name: 'data-message-id', closest: true})
  public set msgId(msgId: string) {
    this._setMsg(game.messages.get(msgId) as any);
  }
  
  public onInit(args: OnInitParam): void {
    args.addStoppable(
      HookManager.updateActor((cbActor) => {
        if (cbActor.uuid === this._actor?.uuid) {
          this._setActor(cbActor);
        }
      }),

      HookManager.updateChatMessage((cbMsg) => {
        if (cbMsg.uuid === this._msg?.uuid) {
          this._setMsg(cbMsg);
        }
      }),
    );
  }

  private _msg: ChatMessageV11;
  private _setMsg(msg: ChatMessageV11): void {
    this._msg = msg;
    if (this._msg == null) {
      if (this._actor != null) {
        this._setActor(null);
      }
    } else {
      const actor: ActorV11 = game.scenes.get(msg.speaker.scene)?.tokens?.get(msg.speaker.token)?.actor || game.actors.get(msg.speaker.actor);
      if (this._actor?.uuid !== actor.uuid) {
        this._setActor(actor);
      }
    }

    this._calcFromCurrentState();
  }

  private _actor: ActorV11;
  private _setActor(actor: ActorV11): void {
    this._actor = actor;
    this._calcFromCurrentState();
  }

  public cardText = '';
  public showCard = false;
  private _interactAction: null | undefined | 'claimNat1' | 'useInsp' | 'imposeDisAdv';
  private _hasInspiration = false;
  private _isNat20 = false;
  private _isNat1 = false;
  private _calcFromCurrentState(): void {
    this.cardText = '';
    this.showCard = false;
    this._interactAction = null;
    this._isNat20 = false;
    this._isNat1 = false;
    this._wrapperClasses = new Set();
    
    if (this._msg == null || this._actor == null) {
      return;
    } else if (!this._actor.testUserPermission(game.user, 'OBSERVER')) {
      return;
    } else if (this._actor.type !== 'character') {
      return;
    }

    let d20Terms: Array<Omit<DiceTerm, 'results'> & {results: Array<DiceTerm.Result & {'dnd5eInspirationToken-inspired'?: boolean}>}> = [];
    for (const roll of this._msg.rolls) {
      let pendingTerms = roll.terms;
      while (pendingTerms.length > 0) {
        const processingTerms = pendingTerms;
        pendingTerms = [];
        for (const term of processingTerms) {
          if (term instanceof ParentheticalTerm) {
            pendingTerms.push(...term.dice);
          } else if (term instanceof DiceTerm && term.faces === 20 && term.number > 0) {
            d20Terms.push(term);
          }
        }
      }
    }
    if (d20Terms.length === 0) {
      return;
    }
    for (const d20 of d20Terms) {
      for (const result of d20.results) {
        if (!result.active || result['dnd5eInspirationToken-inspired']) {
          continue;
        }
        if (result.result === d20.faces) {
          this._isNat20 = true;
        } else if (result.result === 1) {
          this._isNat1 = true;
        }
      }
    }
    
    const toggledTo: boolean | null | undefined = this._msg.flags?.['dnd5e-inspiration-token']?.['toggledTo'];
    const inspirationGivenTo: string | null | undefined = this._msg.flags?.['dnd5e-inspiration-token']?.['givenTo'];
    this.showCard = true;
    this._hasInspiration = !!this._actor.system.attributes.inspiration;

    actionBlock: {
      if (inspirationGivenTo === this._actor.uuid) {
        this.cardText = 'Nat 1 = free inspiration (claimed)';
        break actionBlock;
      }
      if (toggledTo == true) {
        this.cardText = 'Disadvantage applied';
        break actionBlock;
      }
      if (toggledTo == false) {
        this.cardText = 'Advantage applied';
        break actionBlock;
      }
      if (!this._hasInspiration && this._isNat1) {
        this.cardText = 'Nat 1 = free inspiration';
        break actionBlock;
      }
      
      if (game.user.isGM) {
        if (!this._hasInspiration) {
          this.cardText = 'Not inspired';
          break actionBlock;
        } else if (this._isNat1) {
          // TODO
          // this.cardText = 'Nat 1! Give a player inspiration!';
        }
      } else if (this._hasInspiration) {
        this.cardText = 'Inspired';
        break actionBlock;
      }
      this.showCard = false;
    }
    
    if (d20Terms.length === 1 && this._actor.canUserModify(game.user, 'update') && this._msg.canUserModify(game.user, 'update') && toggledTo == null && inspirationGivenTo == null) {
      if (!this._hasInspiration && this._isNat1) {
        this._interactAction = 'claimNat1';
      } else if (this._hasInspiration) {
        this._interactAction = 'useInsp';
      } else {
        this._interactAction = 'imposeDisAdv';
      }
    }

    if (this._interactAction != null) {
      this._wrapperClasses.add('interactive');
    }
    
    if (inspirationGivenTo === this._actor.uuid) {
      this._wrapperClasses.add('active');
    } else if (toggledTo == null ? this._hasInspiration : !toggledTo) {
      this._wrapperClasses.add('active');
    }
  }

  private _clickDisabled = false;
  @BindEvent('click')
  public async onClick(): Promise<void> {
    if (this._clickDisabled || this._interactAction == null || !this.showCard) {
      return;
    }
    try {
      this._clickDisabled = true;
      const confirm = await Dialog.confirm({
        content:
          this._interactAction === 'claimNat1' ? 'Claim your inspiration from rolling a nat 1?' : (
          this._interactAction === 'useInsp' ? 'Use inspiration to reroll the lowest d20?' : (
          this._interactAction === 'imposeDisAdv' ? 'Grant inspiration to reroll the highest d20?' :
          'Are you sure?'
          )),
        defaultYes: true,
      });
      if (!confirm) {
        return;
      }

      if (this._interactAction === 'claimNat1') {
        await this._msg.update({flags: {['dnd5e-inspiration-token']: {['givenTo']: this._actor.uuid}}});
        await this._actor.update({system: { attributes: {inspiration: true} } });
        return;
      }
      const rollIndex = this._msg.rolls.findIndex(roll => roll.terms.find(term => term instanceof DiceTerm && term.faces === 20 && term.number > 0));
      let newRollFormula: string;
      if (this._interactAction === 'useInsp') {
        // Add advantage
        newRollFormula = this._msg.rolls[rollIndex].formula.replace(/([0-9]*)(d20)(?:(d(?:l|(?![a-z])))([0-9]*))?/i, (match, faces, d20, dl, dropLowestNr) => {
          return `${Number(faces)+1}${d20}${dl ? dl + Number(dropLowestNr ?? '1')+1 : 'dl'}`;
        });
      } else if (this._interactAction === 'imposeDisAdv') {
        // Impose disadvantage
        newRollFormula = this._msg.rolls[rollIndex].formula.replace(/([0-9]*)(d20)(?:(dh)([0-9]*))?/i, (match, faces, d20, dh, dropHighestNr) => {
          return `${Number(faces)+1}${d20}${dh ? dh + Number(dropHighestNr ?? '1')+1 : 'dh'}`;
        });
      }
      const rolls = [...this._msg.rolls];
      const modifiedRoll = await UtilsRoll.modifyRoll(this._msg.rolls[rollIndex], newRollFormula);
      // Mark new terms
      for (let termI = 0; termI < modifiedRoll.result.terms.length; termI++) {
        const oldTerm = rolls[rollIndex].terms[termI];
        if (!(oldTerm instanceof DiceTerm)) {
          continue;
        }
        const newTerm = modifiedRoll.result.terms[termI];
        if (!(newTerm instanceof DiceTerm)) {
          continue;
        }
        for (let resultI = 0; resultI < newTerm.results.length; resultI++) {
          if (oldTerm.results[resultI] != null) {
            continue;
          }
          newTerm.results[resultI]['dnd5eInspirationToken-inspired'] = true;
        }
      }
      rolls[rollIndex] = modifiedRoll.result;
      await this._msg.update({rolls: rolls, flags: {['dnd5e-inspiration-token']: {['toggledTo']: !this._hasInspiration}}});
      await this._actor.update({system: { attributes: {inspiration: !this._hasInspiration} } });
      UtilsDiceSoNice.showRoll({
        roll: modifiedRoll.rollToDisplay,
        rollMode: this._msg.blind ? 'blindroll' : null,
        showUserIds: this._msg.whisper.map(w => typeof w === 'string' ? w : w.id),
      });
    } finally {
      this._clickDisabled = false;
    }
  }

}