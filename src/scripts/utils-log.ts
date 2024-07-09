export type FormattedString = string | {
  message: string;
  color?: string;
}

const resetFormat: Required<Omit<FormattedString, 'message'>> = {
  color: 'reset',
}

export class UtilsLog {

  public static buildInfo(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.build(console.info, {message: 'dnd5e-inspiration-token', color: '#ff8f00'}, ...args);
  }
  public static buildDebug(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.build(console.debug, {message: 'dnd5e-inspiration-token', color: '#ff8f00'}, ...args);
  }
  public static buildLog(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.build(console.log, {message: 'dnd5e-inspiration-token', color: '#ff8f00'}, ...args);
  }
  public static buildWarn(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.build(console.warn, {message: 'dnd5e-inspiration-token', color: '#ff8f00'}, ...args);
  }
  public static buildError(...args: FormattedString[]): (message?: any, ...optionalParams: any[]) => void {
    return UtilsLog.build(console.error, {message: 'dnd5e-inspiration-token', color: '#ff8f00'}, ...args);
  }

  private static build(logFunc: Function, ...args: FormattedString[]) {
    const messageParts: string[] = [];
    const styles: string[] = [];
    for (let arg of args) {
      if (typeof arg === 'string') {
        arg = {message: arg}
      }
      arg = {
        ...resetFormat, // reset any values not provided
        ...arg,
      };

      messageParts.push(`%c${arg.message}`);
      styles.push(`color: ${arg.color};`);
    }

    return logFunc.bind(console, messageParts.join(' '), ...styles);
  }

  public static info = UtilsLog.createWithPrefix('info');
  public static debug = UtilsLog.createWithPrefix('debug');
  public static log = UtilsLog.createWithPrefix('log');
  public static warn = UtilsLog.createWithPrefix('warn');
  public static error = UtilsLog.createWithPrefix('error');

  private static createWithPrefix<T extends keyof Console>(key: T): Console[T] {
    if (typeof console[key] === 'function') {
      return UtilsLog.build(console[key], {message: 'dnd5e-inspiration-token', color: '#ff8f00'});
    } else {
      return console[key];
    }
  }

}
