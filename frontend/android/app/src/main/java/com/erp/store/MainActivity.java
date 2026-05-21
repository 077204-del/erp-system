package com.erp.store;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

/**
 * Clears WebView disk/memory cache on every launch and disables HTTP caching
 * so the app loads fresh frontend assets after APK updates or remote deploys.
 */
public class MainActivity extends BridgeActivity {
  private static final String PREFS = "erp_webview_prefs";
  private static final String KEY_VERSION_CODE = "last_version_code";

  @Override
  public void onCreate(Bundle savedInstanceState) {
    SplashScreen.installSplashScreen(this);
    super.onCreate(savedInstanceState);
    final boolean versionChanged = recordVersionChange(this);
    getWindow()
        .getDecorView()
        .post(
            () -> {
              purgeWebViewCaches(true);
              if (versionChanged) {
                reloadWebView();
              }
            });
  }

  @Override
  public void onResume() {
    super.onResume();
    getWindow()
        .getDecorView()
        .post(
            () -> {
              applyNoCacheSettings();
            });
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
    applyNoCacheSettings();
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
    WebSettings settings = webView.getSettings();
    settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    settings.setDomStorageEnabled(true);
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
