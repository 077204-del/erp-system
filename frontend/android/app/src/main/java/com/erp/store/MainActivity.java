package com.erp.store;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * WebView shell for hosted ERP UI + Socket.IO (same as browser).
 * Disables cache, enables JS/storage, signals JS when the page is ready for sockets.
 */
public class MainActivity extends BridgeActivity {
  private static final String TAG = "ERPWebView";
  private static final String PREFS = "erp_webview_prefs";
  private static final String KEY_VERSION_CODE = "last_version_code";
  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  private static final String WEBVIEW_READY_JS =
      "(function(){"
          + "try{"
          + "window.__erpWebViewReady=true;"
          + "console.log('WEBVIEW SOCKET INIT');"
          + "window.dispatchEvent(new Event('erp-webview-ready'));"
          + "}catch(e){console.log('WEBVIEW SOCKET INIT ERR',e&&e.message?e.message:e);}"
          + "})();";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen.installSplashScreen(this);
    super.onCreate(savedInstanceState);
    final boolean versionChanged = recordVersionChange(this);
    whenWebViewReady(
        () -> {
          purgeWebViewCaches(true);
          if (versionChanged) {
            reloadWebView();
          }
          scheduleWebViewReadySignal(800);
        });
  }

  @Override
  public void onResume() {
    super.onResume();
    whenWebViewReady(
        () -> {
          applyNoCacheSettings();
          scheduleWebViewReadySignal(400);
        });
  }

  private void whenWebViewReady(Runnable action) {
    mainHandler.post(
        () -> {
          Bridge bridge = getBridge();
          WebView webView = bridge != null ? bridge.getWebView() : null;
          if (webView == null) {
            mainHandler.postDelayed(() -> whenWebViewReady(action), 300);
            return;
          }
          action.run();
        });
  }

  private void scheduleWebViewReadySignal(long delayMs) {
    mainHandler.postDelayed(this::signalWebViewReadyToJs, delayMs);
  }

  private void signalWebViewReadyToJs() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.evaluateJavascript(WEBVIEW_READY_JS, null);
    Log.d(TAG, "dispatched erp-webview-ready to JS");
  }

  private boolean recordVersionChange(Context ctx) {
    try {
      int current =
          ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0).versionCode;
      SharedPreferences prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
      int last = prefs.getInt(KEY_VERSION_CODE, -1);
      prefs.edit().putInt(KEY_VERSION_CODE, current).apply();
      return last != -1 && last != current;
    } catch (PackageManager.NameNotFoundException e) {
      return false;
    }
  }

  private void purgeWebViewCaches(boolean clearDisk) {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.clearCache(clearDisk);
    webView.clearHistory();
    webView.clearFormData();
    applyNoCacheSettings(webView);
  }

  private void applyNoCacheSettings() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    applyNoCacheSettings(webView);
  }

  private void applyNoCacheSettings(WebView webView) {
    WebSettings settings = webView.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setDatabaseEnabled(true);
    settings.setJavaScriptCanOpenWindowsAutomatically(true);
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(true);
    }
  }

  private void reloadWebView() {
    Bridge bridge = getBridge();
    if (bridge == null) {
      return;
    }
    WebView webView = bridge.getWebView();
    if (webView == null) {
      return;
    }
    webView.reload();
  }
}
