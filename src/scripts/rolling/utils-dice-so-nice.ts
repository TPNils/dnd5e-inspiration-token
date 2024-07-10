import { UtilsRoll } from "./utils-roll.js";

export interface ShowRollRequest {
  roll: Roll;
  user?: User;
  rollMode?: ClientSettings.Values['core.rollMode'];
  showUserIds?: string[];
}

export class UtilsDiceSoNice {

  /**
  * @returns {Promise<boolean>} when resolved true if the animation was displayed, false if not.
   */
  public static async showRoll({roll, user, rollMode, showUserIds}: ShowRollRequest): Promise<boolean> {
    if (!roll || !roll.terms?.length || roll.total == null) {
      return false;
    }
    if (!(game as any).dice3d) {
      return false;
    }
    if (user == null) {
      user = game.user;
    }
    if (rollMode == null) {
      rollMode = game.settings.get('core', 'rollMode');
    }

    // @ts-ignore
    const synchronize = rollMode === 'publicroll' || rollMode === 'roll';
    let blind = rollMode === 'blindroll';
    let whispers: string[] = null;
    if (!showUserIds?.length) {
      if (rollMode === 'gmroll' || rollMode === 'blindroll') {
        whispers = [];
        for (const gameUser of Array.from(game.users.values())) {
          if (gameUser.isGM) {
            whispers.push(gameUser.id);
          }
        }
      }
    } else {
      whispers = showUserIds ?? [];
      // You have to explicitly mention your own user when listing all who can see
      if (!showUserIds.includes(game.userId)) {
        blind = true;
      }
    }

    // DiceSoNice does something weird to find the dice, but I think this is to solve some weird foundry behavior
    // Simplified: only give DiceSoNice vanilla foundry dice
    const vanillaTerms: RollTerm[] = [];
    let hasCustomTerms = false;
    for (const term of UtilsRoll.rollAlwaysWithDamageType(roll).terms) {
      if (term instanceof Die && term.constructor !== Die) {
        vanillaTerms.push(new Die(term.toJSON()));
        hasCustomTerms = true;
      } else if (term instanceof FateDie && term.constructor !== FateDie) {
        vanillaTerms.push(new FateDie(term.toJSON()));
        hasCustomTerms = true;
      } else if (term instanceof Coin && term.constructor !== Coin) {
        vanillaTerms.push(new Coin(term.toJSON()));
        hasCustomTerms = true;
      } else {
        vanillaTerms.push(term);
      }
    }

    if (hasCustomTerms) {
      roll = Roll.fromTerms(vanillaTerms);
    }

    return (game as any).dice3d.showForRoll(roll, user, synchronize, whispers, blind);
  }

}