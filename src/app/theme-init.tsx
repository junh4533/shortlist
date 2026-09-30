"use client";

/** Injects the pre-hydration theme script into the SSR HTML stream (avoids React 19 script-in-component warning). */
import { useServerInsertedHTML } from "next/navigation";

const themeScript = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark")}catch(e){}})()`;

export function ThemeInit() {
  useServerInsertedHTML(() => (
    <script
      id="theme-init"
      dangerouslySetInnerHTML={{ __html: themeScript }}
    />
  ));
  return null;
}
