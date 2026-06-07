import { defineSetupPluginEntry } from "openclaw/plugin-sdk/channel-core";
import { messengerSetupPlugin } from "./src/channel.js";

const entry: unknown = defineSetupPluginEntry(messengerSetupPlugin);

export default entry;
