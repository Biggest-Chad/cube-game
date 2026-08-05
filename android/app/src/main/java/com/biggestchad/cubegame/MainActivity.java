package com.biggestchad.cubegame;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

/**
 * True sticky immersive fullscreen for landscape play.
 * Status bar (clock) and navigation (back/home) stay hidden until the user
 * swipes them in; they auto-hide again like other full-screen mobile games.
 */
public class MainActivity extends BridgeActivity {
    private final Handler immersiveHandler = new Handler(Looper.getMainLooper());
    private final Runnable immersiveRunnable = this::applyImmersive;
    private boolean focused = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Apply theme flags before super so the WebView boots fullscreen
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        super.onCreate(savedInstanceState);
        applyImmersive();
        scheduleImmersiveWatch();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        focused = hasFocus;
        if (hasFocus) {
            applyImmersive();
            scheduleImmersiveWatch();
        } else {
            immersiveHandler.removeCallbacks(immersiveRunnable);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersive();
        scheduleImmersiveWatch();
    }

    @Override
    public void onPause() {
        immersiveHandler.removeCallbacks(immersiveRunnable);
        super.onPause();
    }

    /** Periodically re-assert sticky immersive while the activity is focused. */
    private void scheduleImmersiveWatch() {
        immersiveHandler.removeCallbacks(immersiveRunnable);
        immersiveHandler.postDelayed(
            new Runnable() {
                @Override
                public void run() {
                    if (!focused) return;
                    applyImmersive();
                    immersiveHandler.postDelayed(this, 1500);
                }
            },
            1500
        );
    }

    @SuppressWarnings("deprecation")
    private void applyImmersive() {
        Window window = getWindow();
        if (window == null) return;

        WindowCompat.setDecorFitsSystemWindows(window, false);

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        window.clearFlags(
            WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS
                | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION
        );

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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
        }

        View decor = window.getDecorView();

        // Consume system bar insets so they never pad the WebView layout
        ViewCompat.setOnApplyWindowInsetsListener(
            decor,
            (v, insets) -> {
                // Hide bars whenever insets try to reappear
                WindowInsetsControllerCompat c =
                    WindowCompat.getInsetsController(window, decor);
                if (c != null) {
                    c.hide(
                        WindowInsetsCompat.Type.statusBars()
                            | WindowInsetsCompat.Type.navigationBars()
                    );
                }
                // Consume system bars so content is not offset
                return WindowInsetsCompat.CONSUMED;
            }
        );

        // Legacy sticky immersive (pre-R WebViews still honor this)
        int flags =
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LOW_PROFILE;
        decor.setSystemUiVisibility(flags);

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(window, decor);
        if (controller != null) {
            controller.hide(
                WindowInsetsCompat.Type.statusBars()
                    | WindowInsetsCompat.Type.navigationBars()
                    | WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.systemBars()
            );
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }

        // Re-hide shortly after the user swipes bars back
        decor.setOnSystemUiVisibilityChangeListener(
            visibility -> {
                boolean barsVisible =
                    (visibility & View.SYSTEM_UI_FLAG_FULLSCREEN) == 0
                        || (visibility & View.SYSTEM_UI_FLAG_HIDE_NAVIGATION) == 0;
                if (barsVisible) {
                    immersiveHandler.removeCallbacks(immersiveRunnable);
                    immersiveHandler.postDelayed(this::applyImmersive, 600);
                }
            }
        );

        // Also watch modern inset changes
        ViewCompat.setOnApplyWindowInsetsListener(
            decor,
            (v, windowInsets) -> {
                Insets sys =
                    windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                if (sys.bottom > 0 || sys.top > 0 || sys.left > 0 || sys.right > 0) {
                    immersiveHandler.removeCallbacks(immersiveRunnable);
                    immersiveHandler.postDelayed(this::applyImmersive, 400);
                }
                return WindowInsetsCompat.CONSUMED;
            }
        );
    }
}
