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

const requestConfirmDialogMock =
  vi.fn<(message: string, options?: ConfirmDialogOptions) => Promise<boolean> | undefined>();

vi.mock("./contextMenuFallback", () => ({
  showContextMenuFallback: showContextMenuFallbackMock,
  dismissContextMenu: dismissContextMenuMock,
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
});

describe("LocalApi", () => {
  it("fails closed in a browser when no themed host is available", async () => {
    requestConfirmDialogMock.mockReturnValue(undefined);
    const { createLocalApi } = await import("./localApi");

    await expect(createLocalApi().dialogs.confirm("Delete this thread?")).resolves.toBe(false);
  });

  it("shows themed context menus in the DOM on desktop only when enabled", async () => {
    const items: ContextMenuItem<"rename">[] = [{ id: "rename", label: "Rename" }];
    const nativeShow = vi.fn(async () => "rename" as const);
    Object.defineProperty(testWindow(), "desktopBridge", {
      configurable: true,
      value: { showContextMenu: nativeShow },
    });
    showContextMenuFallbackMock.mockResolvedValue(null);
    const { createLocalApi, setThemedContextMenus } = await import("./localApi");
    const api = createLocalApi();

    await expect(api.contextMenu.show(items)).resolves.toBe("rename");
    expect(showContextMenuFallbackMock).not.toHaveBeenCalled();

    setThemedContextMenus(true);
    await expect(api.contextMenu.show(items)).resolves.toBeNull();
    expect(nativeShow).toHaveBeenCalledTimes(1);
    expect(showContextMenuFallbackMock).toHaveBeenCalledTimes(1);

    await api.contextMenu.close();
    expect(dismissContextMenuMock).toHaveBeenCalledTimes(1);
  });
});
