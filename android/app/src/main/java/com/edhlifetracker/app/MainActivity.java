package com.edhlifetracker.app;

import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A game can sit untouched for minutes while someone thinks — keep
        // the tablet from dimming and locking under the table's life totals.
        // Only applies while this window is showing, so no permission needed.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        goEdgeToEdge();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Re-applying on every focus gain (not just onCreate) is what makes
        // immersive mode "sticky" — otherwise the bars stay revealed after a
        // user swipe, or after returning from a dialog/other app.
        if (hasFocus) {
            goEdgeToEdge();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        // Screen pinning ("lock task"): keeps this app in the foreground so
        // the usual edge-swipe-to-home gesture can't casually minimize it
        // mid-game. No special permission/device-owner setup is required —
        // on first call Android shows its own one-time "pin this app?"
        // system prompt; afterwards leaving requires the OS's unpin gesture
        // (hold Back + Recents, or on gesture nav: swipe up and hold).
        try {
            startLockTask();
        } catch (Exception e) {
            // Some OEM skins/MDM policies disallow lock task mode — the app
            // still runs normally, it's just not pinned.
        }
    }

    private void goEdgeToEdge() {
        Window window = getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        WindowInsetsControllerCompat controller =
            new WindowInsetsControllerCompat(window, window.getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
