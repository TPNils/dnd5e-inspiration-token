import { ChatMessageDataConstructorData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/chatMessageData";

export interface ChatMessageV11 extends Omit<ChatMessage, 'data', 'roll'>, Omit<ChatMessageDataConstructorData, 'roll'> {
  rolls: Roll[];
}

export interface ActorV11 {
  testUserPermission(user: User, permission: keyof typeof CONST.DOCUMENT_PERMISSION_LEVELS, options?: {exact?: boolean;})
  readonly system: {
    [key: string]: any;
    attributes: {
      [key: string]: any;
      inspiration?: boolean;
    }
  }
}