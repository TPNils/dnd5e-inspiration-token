import { Stoppable } from "nils-library";

interface DiceTermResult extends DiceTerm.Result {
  notRolled?: boolean;
}

export namespace ReusableDiceTerm {
  export interface Options {
    /** Can only use these options while the context is active */
    prerolledPool: {[face: `${number}`]: number[]};
    newRolls: {[face: `${number}`]: Die['results']};
  }
}

declare global {
  interface DiceTerm {
    /**
     * Maps a randomly-generated value in the interval [0, 1) to a face value on the die.
     * @param  randomUniform  A value to map. Must be in the interval [0, 1).
     * @returns               The face value.
     */
    mapRandomFace(randomUniform: number): number
  
    /**
     * Generate a random face value for this die using the configured PRNG.
     */
    randomFace(): number;
  }
}


export namespace ReusableDiceTerm {

  export function wrapRoll<R extends Roll>(inputRoll: R, options: ReusableDiceTerm.Options): R {
    const appendUnrolledRolls = (roll: R) => {
      for (const [face, results] of Object.entries(options.prerolledPool)) {
        if (results.length > 0) {
          roll.terms.push(new OperatorTerm({operator: '+'}));
          roll.terms.push(new Die({number: 0, faces: Number(face), results: results.map(r => ({result: r, discarded: true, active: false}))}));
        }
      }
    }

    const wrapDiceTerms = (roll: R) => {
      for (const term of roll.terms) {
        if (term instanceof DiceTerm) {
          const originalRandomFace = term.randomFace;
          term.randomFace = function (this: DiceTerm, ...args: any[]): number {
            const pool = options.prerolledPool?.[String(this.faces) as `${number}`];
            if (pool?.length) {
              const oldResult = pool.splice(0, 1)[0];
              options.newRolls[`${this.faces}`] ??= [];
              // TODO this is a placeholder result, should make this accurate
              options.newRolls[`${this.faces}`].push({result: oldResult, active: true});
              return oldResult;
            }
            return originalRandomFace.apply(this, args);
          }
          // @ts-ignore
          term.randomFace.original = originalEvaluateFn;
        }
      }
    }

    const unwrapDiceTerms = (roll: R) => {
      for (const term of roll.terms) {
        if (term instanceof DiceTerm) {
          // @ts-ignore
          if (typeof term.randomFace.original === 'function') {
            // @ts-ignore
            term.randomFace = term.randomFace.original;
          }
        }
      }
    }

    const originalEvaluateFn = inputRoll.evaluate;
    inputRoll.evaluate = <any> function(this: R, ...args: Parameters<R['evaluate']>): ReturnType<R['evaluate']> {
      wrapDiceTerms(this);
      let response = originalEvaluateFn.apply(this, args);

      if (response instanceof Promise) {
        response = response.then(r => {
          unwrapDiceTerms(this);
          appendUnrolledRolls(this);
          return r;
        })
      } else {
        unwrapDiceTerms(this);
        appendUnrolledRolls(this);
      }

      inputRoll.evaluate = originalEvaluateFn;
      return response;
    }

    return inputRoll;
  }

}