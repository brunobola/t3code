import type {
  ConfirmDialogOptions,
  ContextMenuItem,
  ContextMenuSource,
  LocalApi,
} from "@t3tools/contracts";
import { msg } from "gt-react";

import { isWebUrl } from "./browser/webUrl";
import { requestConfirmDialog } from "./confirmDialog";
import {
  dismissContextMenu,
  rasterizeMenuIcon,
  showContextMenuFallback,
} from "./contextMenuFallback";
import { readBrowserClientSettings, writeBrowserClientSettings } from "./clientPersistenceStorage";
import { m } from "./i18n/messages";

let cachedApi: LocalApi | undefined;

// Native menus follow the app's light or dark mode, so the icon color follows it too.
// macOS menus need template images to recolor on highlight, so they keep their own icons.
const drawsNativeMenuIcons = () => !/^Mac/.test(navigator.platform);
const nativeMenuIconColor = () =>
  document.documentElement.classList.contains("dark") ? "#c8c8c8" : "#555555";

function withNativeMenuIcons<T extends string>(
  items: readonly ContextMenuItem<T>[],
): ContextMenuItem<T>[] {
  return items.map((item) => {
    const children = item.children ? withNativeMenuIcons(item.children) : undefined;
    // Windows draws an item's icon in the check column, so checkable items keep only the check.
    const iconImage =
      item.iconImage ??
      (item.icon && typeof item.checked !== "boolean"
        ? rasterizeMenuIcon(item.icon, nativeMenuIconColor())
        : null);
    return {
      ...item,
      ...(children ? { children } : {}),
      ...(iconImage ? { iconImage } : {}),
    };
  });
}

export function createLocalApi(): LocalApi {
  return {
    dialogs: {
      pickFolder: async (options) => {
        if (!window.desktopBridge) return null;
        return window.desktopBridge.pickFolder(options);
      },
      confirm: async (message, options?: ConfirmDialogOptions) => {
        return requestConfirmDialog(message, options) ?? false;
      },
    },
    shell: {
      openExternal: async (url) => {
        if (window.desktopBridge) {
          const opened = await window.desktopBridge.openExternal(url);
          if (!opened) {
            throw new Error(m(msg("Unable to open link.")));
          }
          return;
        }

        if (!isWebUrl(url)) throw new Error(m(msg("Unable to open link.")));
        window.open(url, "_blank", "noopener,noreferrer");
      },
      openSystemSettings: async (pane) => {
        if (!window.desktopBridge) {
          throw new Error(m(msg("Unable to open System Settings.")));
        }
        const opened = await window.desktopBridge.openSystemSettings(pane);
        if (!opened) {
          throw new Error(m(msg("Unable to open System Settings.")));
        }
      },
    },
    contextMenu: {
      show: async <T extends string>(
        items: readonly ContextMenuItem<T>[],
        position?: { x: number; y: number },
        source?: ContextMenuSource,
      ): Promise<T | null> => {
        if (window.desktopBridge) {
          const withIcons = drawsNativeMenuIcons() ? withNativeMenuIcons(items) : items;
          return window.desktopBridge.showContextMenu(
            withIcons,
            position,
            source,
          ) as Promise<T | null>;
        }
        return showContextMenuFallback(items, position, source);
      },
      // Unlike native menus, the DOM fallback needs dismissal when underlying state disappears.
      close: async () => {
        if (!window.desktopBridge) {
          dismissContextMenu();
        }
      },
    },
    persistence: {
      getClientSettings: async () => {
        if (window.desktopBridge) {
          return window.desktopBridge.getClientSettings();
        }
        return readBrowserClientSettings();
      },
      setClientSettings: async (settings) => {
        if (window.desktopBridge) {
          return window.desktopBridge.setClientSettings(settings);
        }
        writeBrowserClientSettings(settings);
      },
    },
  };
}

export function readLocalApi(): LocalApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  cachedApi = createLocalApi();
  return cachedApi;
}

export function ensureLocalApi(): LocalApi {
  const api = readLocalApi();
  if (!api) {
    throw new Error("Local API not found");
  }
  return api;
}
