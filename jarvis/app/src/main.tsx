import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { runtime, WindowKind } from "./runtime";
import "./styles/base.css";
import "./styles/hud.css";
import { Hud } from "./views/Hud";
import { Mini } from "./views/Mini";
import { Palette } from "./views/Palette";

const route = (window.location.hash.replace(/^#\/?/, "") || "hud") as "hud" | "mini" | "palette";
const kind: WindowKind = route === "mini" ? "mini" : route === "palette" ? "palette" : "main";
document.documentElement.dataset.window = kind;
runtime.start(kind);

const View = route === "mini" ? Mini : route === "palette" ? Palette : Hud;
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <View />
  </StrictMode>,
);
