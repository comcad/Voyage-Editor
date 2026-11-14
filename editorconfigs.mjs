import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigMgr } from './configmgr.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/** server.js's settings from conf/editor.conf. Keys and defaults match conf/editor.conf.dist. */
export const EditorConfigs = {
  get HOST() { return ConfigMgr.getString('Editor.Host', '0.0.0.0'); },
  get PORT() {
    const port = ConfigMgr.getInt('Editor.Port', 3001);
    if (port >= 1 && port <= 65535) return port;
    console.warn(`Config key Editor.Port = ${port} isn't a port (1-65535); defaulting to 3001`);
    return 3001;
  },
  /** The password to sign in with; without one only the machine itself is let in. */
  get PASSWORD() { return ConfigMgr.getString('Editor.Password', ''); },
  /** The assets folder the Voyage extractor made, shared with Voyage-Client and Voyage-Server. */
  get ASSETS_DIR() { return path.resolve(ROOT, ConfigMgr.getString('Editor.AssetsDir', '../voyage-assets')); },
  /** Where the editor keeps its drafts, what it has published and the pictures brought in. */
  get DATA_DIR() { return path.resolve(ROOT, ConfigMgr.getString('Editor.DataDir', 'data')); },
};
