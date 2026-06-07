import { defineChannelPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { messengerPlugin, registerMessengerWebhookRoute } from "./src/channel.js";
import { CHANNEL_ID } from "./src/config.js";

const entry: unknown = defineChannelPluginEntry({
  id: CHANNEL_ID,
  name: "Facebook Messenger",
  description: "Meta Messenger Platform webhook channel plugin",
  plugin: messengerPlugin,
  registerFull(api) {
    registerMessengerWebhookRoute(api);
  },
});

export default entry;
export { messengerPlugin } from "./src/channel.js";
