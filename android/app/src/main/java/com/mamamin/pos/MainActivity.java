package com.mamamin.pos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BackupBridgePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
