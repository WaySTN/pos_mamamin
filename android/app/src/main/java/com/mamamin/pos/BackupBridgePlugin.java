package com.mamamin.pos;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "BackupBridge")
public class BackupBridgePlugin extends Plugin {

    @PluginMethod
    public void shareBackupFile(PluginCall call) {
        String fileName = call.getString("fileName", "mamamin-backup.json");
        String content = call.getString("content", "");

        try {
            Context context = getContext();
            File cacheDir = new File(context.getCacheDir(), "backups");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            File backupFile = new File(cacheDir, fileName);
            try (FileOutputStream fos = new FileOutputStream(backupFile)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }

            Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                backupFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("application/json");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, "Cadangan Data MamaMin POS");
            shareIntent.putExtra(Intent.EXTRA_TEXT, "File cadangan SQLite MamaMin POS: " + fileName);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, "Bagikan Cadangan MamaMin POS");
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(chooser);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("fileName", fileName);
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal membagikan file backup: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName", "mamamin-backup.json");
        String content = call.getString("content", "");

        try {
            Context context = getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                values.put(MediaStore.MediaColumns.MIME_TYPE, "application/json");
                values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);

                Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) {
                    throw new Exception("Gagal membuat entri file di folder Download");
                }
                try (OutputStream os = resolver.openOutputStream(uri)) {
                    if (os != null) {
                        os.write(content.getBytes(StandardCharsets.UTF_8));
                    }
                }
            } else {
                File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                if (!downloadDir.exists()) {
                    downloadDir.mkdirs();
                }
                File targetFile = new File(downloadDir, fileName);
                try (FileOutputStream fos = new FileOutputStream(targetFile)) {
                    fos.write(content.getBytes(StandardCharsets.UTF_8));
                }
            }

            // Simpan juga salinan di cache internal agar dapat di-restore langsung tanpa dialog SAF
            File cacheDir = new File(context.getCacheDir(), "backups");
            if (!cacheDir.exists()) {
                cacheDir.mkdirs();
            }
            File cachedFile = new File(cacheDir, fileName);
            try (FileOutputStream fos = new FileOutputStream(cachedFile)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("fileName", fileName);
            ret.put("message", "File berhasil disimpan ke folder Download");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal menyimpan file ke folder Download: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void listAvailableBackups(PluginCall call) {
        try {
            Context context = getContext();
            File cacheDir = new File(context.getCacheDir(), "backups");
            com.getcapacitor.JSArray array = new com.getcapacitor.JSArray();
            if (cacheDir.exists() && cacheDir.isDirectory()) {
                File[] files = cacheDir.listFiles((dir, name) -> name.startsWith("mamamin-backup") && name.endsWith(".json"));
                if (files != null) {
                    java.util.Arrays.sort(files, (a, b) -> Long.compare(b.lastModified(), a.lastModified()));
                    for (File f : files) {
                        JSObject item = new JSObject();
                        item.put("fileName", f.getName());
                        item.put("sizeBytes", f.length());
                        item.put("modifiedAtMs", f.lastModified());
                        array.put(item);
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("files", array);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal membaca daftar file backup: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void readBackupContent(PluginCall call) {
        String fileName = call.getString("fileName");
        if (fileName == null || fileName.isEmpty()) {
            call.reject("Nama file tidak boleh kosong");
            return;
        }
        try {
            Context context = getContext();
            File cacheDir = new File(context.getCacheDir(), "backups");
            File file = new File(cacheDir, fileName);
            if (!file.exists()) {
                call.reject("File backup tidak ditemukan: " + fileName);
                return;
            }
            byte[] bytes = java.nio.file.Files.readAllBytes(file.toPath());
            String content = new String(bytes, StandardCharsets.UTF_8);
            JSObject ret = new JSObject();
            ret.put("fileName", fileName);
            ret.put("content", content);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Gagal membaca isi file backup: " + e.getMessage(), e);
        }
    }
}
