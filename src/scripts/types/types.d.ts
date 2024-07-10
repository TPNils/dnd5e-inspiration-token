import { ChatMessageDataConstructorData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/chatMessageData";

export interface ChatMessageV11 extends Omit<ChatMessage, 'data', 'roll'>, Omit<ChatMessageDataConstructorData, 'roll'> {
  uuid: string;
  rolls: Roll[];
  update(data: any, options?: any): Promise<void>;
  canUserModify(user: User, permission: 'insert' | 'update' | 'delete'): boolean;
}

export interface ActorV11 {
  type: string;
  uuid: string;
  update(data: any, options?: any): Promise<void>;
  canUserModify(user: User, permission: 'insert' | 'update' | 'delete'): boolean;
  testUserPermission(user: User, permission: keyof typeof CONST.DOCUMENT_PERMISSION_LEVELS, options?: {exact?: boolean;}): boolean;
  readonly system: {
    [key: string]: any;
    attributes: {
      [key: string]: any;
      inspiration?: boolean;
    }
  }
}

declare global {
  
  /**
   * Test if two objects contain the same enumerable keys and values.
   */
  function objectsEqual(a: any, b: any): boolean;
}