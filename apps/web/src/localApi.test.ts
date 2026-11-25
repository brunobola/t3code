import { type ConfirmDialogOptions, type ContextMenuItem } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const showContextMenuFallbackMock =
  vi.fn<
    <T extends string>(
      items: readonly ContextMenuItem<T>[],
      position?: { x: number; y: number },
    ) => Promise<T | null>
  >();
const dismissContextMenuMock = vi.fn<() => void>();
const rasterizeMenuIconMock = vi.fn((name: string, color: string) => `png:${name}:${color}`);

const requestConfirmDialogMock =
  vi.fn<(message: string, options?: ConfirmDialogOptions) => Promise<boolean> | undefined>();

vi.mock("./contextMenuFallback", () => ({
  showContextMenuFallback: showContextMenuFallbackMock,
  dismissContextMenu: dismissContextMenuMock,
  rasterizeMenuIcon: rasterizeMenuIconMock,
}));

vi.mock("./confirmDialog", () => ({
  requestConfirmDialog: requestConfirmDialogMock,
}));

function createLocalStorageStub(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

function testWindow(): Window & typeof globalThis {
  return globalThis.window ?? (globalThis as unknown as Window & typeof globalThis);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  if (globalThis.window === undefined) {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  }
  Reflect.deleteProperty(testWindow(), "desktopBridge");
  Object.defineProperty(testWindow(), "localStorage", {
    configurable: true,
    value: createLocalStorageStub(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LocalApi", () => {
  it("fails closed in a browser when no themed host is available", async () => {
    requestConfirmDialogMock.mockReturnValue(undefined);
    const { createLocalApi } = await import("./localApi");

    await expect(createLocalApi().dialogs.confirm("Delete this thread?")).resolves.toBe(false);
  });

  it("draws named icons into native desktop menus, except checkable items and macOS", async () => {
    const nativeShow = vi.fn(async (_items: readonly ContextMenuItem[]) => null);
    Object.defineProperty(testWindow(), "desktopBridge", {
      configurable: true,
      value: { showContextMenu: nativeShow },
    });
    vi.stubGlobal("document", {
      documentElement: { classList: { contains: (name: string) => name === "dark" } },
    });
    const items: ContextMenuItem[] = [
      { id: "pin", label: "Pin", icon: "pin" },
      { id: "editor", label: "Open in editor", icon: "folder", iconImage: "png:editor" },
      {
        id: "auto",
        label: "Auto-settle",
        icon: "timer",
        children: [{ id: "never", label: "Never", icon: "check", checked: true }],
      },
    ];
    const { createLocalApi } = await import("./localApi");
    const api = createLocalApi();

    vi.stubGlobal("navigator", { platform: "Win32" });
    await api.contextMenu.show(items);
    const [shown] = nativeShow.mock.calls[0]!;
    expect(shown.map((item) => item.iconImage)).toEqual([
      "png:pin:#c8c8c8",
      "png:editor",
      "png:timer:#c8c8c8",
    ]);
    expect(shown[2]!.children![0]!.iconImage).toBeUndefined();

    vi.stubGlobal("navigator", { platform: "MacIntel" });
    await api.contextMenu.show(items);
    expect(nativeShow.mock.calls[1]![0]).toBe(items);
  });
});
