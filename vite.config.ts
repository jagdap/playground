import { defineConfig, type Plugin } from "vite";
// @ts-expect-error plain JS helper shared with the packaged Python server's API
import { handleMusic } from "./scripts/apple-music.mjs";

const appleMusic = (): Plugin => ({
  name: "apple-music",
  configureServer(server) {
    server.middlewares.use("/api/music", handleMusic);
  },
  configurePreviewServer(server) {
    server.middlewares.use("/api/music", handleMusic);
  },
});

// Relative base so the built app works from any folder or static host.
export default defineConfig({ base: "./", plugins: [appleMusic()] });
