import { getString, initLocale } from "./utils/locale";
import { registerPrefsScripts } from "./modules/preferenceScript";
import { createZToolkit } from "./utils/ztoolkit";
import { maybeRunStartupSelfTest } from "./modules/devHarness";
import { maybeRunAutoscoreProbe } from "./modules/autoScoreProbe";
import {
  registerScoreColumn,
  unregisterScoreColumn,
} from "./modules/scoreColumn";
import {
  registerStatusColumn,
  unregisterStatusColumn,
} from "./modules/statusColumn";
import { registerItemMenu, unregisterItemMenu } from "./modules/itemMenu";
import { registerAutoScore, unregisterAutoScore } from "./modules/autoScore";
import { ensureIdeaSummary, isIdeaActive } from "./modules/ideaAnchor";
import { ensureSchema } from "./services/db";
import { runStartupMigrations } from "./modules/migration";
import { warnIfLLMMisconfigured } from "./modules/toast";
import {
  registerWhyReadSection,
  unregisterWhyReadSection,
} from "./modules/whyReadSection";

async function onStartup() {
  Zotero.debug("[ZotRead] onStartup begin");
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  try {
    initLocale();
  } catch (e) {
    Zotero.debug("[ZotRead] initLocale failed: " + String(e));
  }

  try {
    registerPrefsPane();
    Zotero.debug("[ZotRead] prefs pane registered");
  } catch (e) {
    Zotero.debug("[ZotRead] prefs pane register failed: " + String(e));
  }

  try {
    await registerScoreColumn();
  } catch (e) {
    Zotero.debug("[ZotRead] score column register failed: " + String(e));
  }

  try {
    await registerStatusColumn();
  } catch (e) {
    Zotero.debug("[ZotRead] status column register failed: " + String(e));
  }

  try {
    registerAutoScore();
  } catch (e) {
    Zotero.debug("[ZotRead] autoscore register failed: " + String(e));
  }

  try {
    await registerWhyReadSection();
  } catch (e) {
    Zotero.debug("[ZotRead] WhyRead section register failed: " + String(e));
  }

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
  Zotero.debug("[ZotRead] onStartup done");

  // If the user has an active idea, make sure its summary is ready so
  // subsequent ranking can include it without extra UI clicks.
  (async () => {
    try {
      await ensureSchema();
      if (await isIdeaActive()) {
        await ensureIdeaSummary();
        Zotero.debug("[ZotRead] idea summary warmed");
      }
    } catch (e) {
      Zotero.debug("[ZotRead] idea warm failed: " + String(e));
    }
  })();

  // Drop stale similarity rows from old methods and warm cache if empty.
  runStartupMigrations().catch((e) =>
    Zotero.debug("[ZotRead] migration crashed: " + String(e)),
  );

  // Surface missing-API-key warning so users don't wonder why nothing ranks.
  setTimeout(() => warnIfLLMMisconfigured(), 5000);

  // Fire-and-forget self-test if the corresponding dev pref is set.
  maybeRunStartupSelfTest().catch((e) => {
    Zotero.debug("[ZotRead] self-test crashed: " + String(e));
  });
  maybeRunAutoscoreProbe().catch((e) => {
    Zotero.debug("[ZotRead] autoscore probe crashed: " + String(e));
  });
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  Zotero.debug("[ZotRead] onMainWindowLoad begin");
  try {
    addon.data.ztoolkit = createZToolkit();
    Zotero.debug("[ZotRead] ztoolkit created");
  } catch (e) {
    Zotero.debug("[ZotRead] createZToolkit failed: " + String(e));
  }

  try {
    (win as any).MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-mainWindow.ftl`,
    );
    // Pre-warm the prefs FTL on the main window so when the user opens
    // Settings → ZotRead the first time on a fresh profile, the bundle
    // is already known to Firefox's l10n cache. Without this, `data-l10n-id`
    // elements in the prefs pane render blank on first open.
    (win as any).MozXULElement.insertFTLIfNeeded(
      `${addon.data.config.addonRef}-preferences.ftl`,
    );
  } catch (e) {
    Zotero.debug("[ZotRead] FTL insert failed: " + String(e));
  }

  try {
    registerItemMenu(win as unknown as Window);
    Zotero.debug("[ZotRead] item menu registered");
  } catch (e) {
    Zotero.debug("[ZotRead] item menu register failed: " + String(e));
  }

  try {
    new ztoolkit.ProgressWindow(addon.data.config.addonName, {
      closeOnClick: true,
      closeTime: 4000,
    })
      .createLine({
        text: getString("startup-finish"),
        type: "success",
        progress: 100,
      })
      .show();
    Zotero.debug("[ZotRead] startup toast shown");
  } catch (e) {
    Zotero.debug("[ZotRead] ProgressWindow failed: " + String(e));
  }
  Zotero.debug("[ZotRead] onMainWindowLoad done");
}

async function onMainWindowUnload(win: Window): Promise<void> {
  try {
    unregisterItemMenu(win);
  } catch (e) {
    Zotero.debug("[ZotRead] item menu unregister failed: " + String(e));
  }
  try {
    ztoolkit.unregisterAll();
  } catch (e) {
    Zotero.debug("[ZotRead] unregisterAll failed: " + String(e));
  }
  addon.data.dialog?.window?.close();
}

function onShutdown(): void {
  try {
    ztoolkit.unregisterAll();
  } catch (e) {
    Zotero.debug("[ZotRead] unregisterAll failed: " + String(e));
  }
  unregisterScoreColumn().catch(() => undefined);
  unregisterStatusColumn().catch(() => undefined);
  unregisterAutoScore();
  unregisterWhyReadSection().catch(() => undefined);
  addon.data.dialog?.window?.close();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: unknown },
) {
  Zotero.debug(
    "[ZotRead] notify: " + JSON.stringify({ event, type, ids, extraData }),
  );
}

async function onPrefsEvent(type: string, data: { [key: string]: unknown }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window as Window);
      break;
    default:
      return;
  }
}

function registerPrefsPane(): void {
  const addonRef = addon.data.config.addonRef;
  Zotero.PreferencePanes.register({
    pluginID: addon.data.config.addonID,
    src: `chrome://${addonRef}/content/preferences.xhtml`,
    label: "ZotRead",
    image: `chrome://${addonRef}/content/icons/section-icon.svg`,
    defaultXUL: true,
  });
}

function onShortcuts(_type: string) {
  // Reserved for future keyboard shortcuts.
}

function onDialogEvents(_type: string) {
  // Reserved for future dialog dispatch.
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
