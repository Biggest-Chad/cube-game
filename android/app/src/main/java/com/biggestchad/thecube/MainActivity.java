package com.biggestchad.thecube;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * Sticky immersive fullscreen for The Cube.
 * Status + nav bars stay hidden; swipe shows them transiently, then they hide again.
 *
 * NOTE: This is the LIVE activity (namespace com.biggestchad.thecube).
 */
public class MainActivity extends BridgeActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean focused = false;

    private final Runnable reassertImmersive =
        new Runnable() {
            @Override
            public void run() {
                if (!focused) return;
                applyImmersive();
                handler.postDelayed(this, 1200);
            }
        };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Fullscreen before content so bars never paint first frame
        applyWindowFlags();
        super.onCreate(savedInstanceState);
        applyImmersive();
        // After WebView attaches, re-apply
        getWindow()
            .getDecorView()
            .post(
                () -> {
                    applyImmersive();
                    View content = findViewById(android.R.id.content);
                    if (content != null) {
                        content.post(this::applyImmersive);
                    }
                });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        focused = hasFocus;
        if (hasFocus) {
            applyImmersive();
            startWatch();
        } else {
            stopWatch();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        focused = true;
        applyImmersive();
        startWatch();
    }

    @Override
    public void onPause() {
        stopWatch();
        super.onPause();
    }

    private void startWatch() {
        stopWatch();
        handler.postDelayed(reassertImmersive, 800);
    }

    private void stopWatch() {
        handler.removeCallbacks(reassertImmersive);
    }

    private void applyWindowFlags() {
        Window window = getWindow();
        if (window == null) return;
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.clearFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN);
        WindowCompat.setDecorFitsSystemWindows(window, false);
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
    }

    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        Window window = getWindow();
        if (window == null) return;

        applyWindowFlags();

        View decor = window.getDecorView();
        // Sticky immersive — reliable on WebView / Capacitor
        final int flags =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN;
        decor.setSystemUiVisibility(flags);

        WindowInsetsControllerCompat c =
            WindowCompat.getInsetsController(window, decor);
        if (c != null) {
            c.hide(
                WindowInsetsCompat.Type.statusBars()
                    | WindowInsetsCompat.Type.navigationBars()
                    | WindowInsetsCompat.Type.systemBars()
            );
            c.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }

        decor.setOnSystemUiVisibilityChangeListener(
            visibility -> {
                if ((visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0
                    || (visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0) {
                    handler.postDelayed(this::applyImmersive, 500);
                }
            });
    }
}
