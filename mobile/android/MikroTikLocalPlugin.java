package ng.com.mycollectivesub.admin;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * Native Android Capacitor Plugin for direct local Wi-Fi communication with MikroTik
 * routers over RouterOS Binary API (TCP port 8728).
 *
 * Enables true Mikroticket-style phone-on-router-Wi-Fi onboarding (IP + Username + Password)
 * with zero browser CORS/mixed-content blocks and zero WinBox required.
 */
@CapacitorPlugin(name = "MikroTikLocal")
public class MikroTikLocalPlugin extends Plugin {

    private static byte[] encodeLength(int len) {
        if (len < 0x80) return new byte[]{(byte) len};
        if (len < 0x4000) return new byte[]{(byte) ((len >> 8) | 0x80), (byte) (len & 0xff)};
        if (len < 0x200000) return new byte[]{(byte) ((len >> 16) | 0xc0), (byte) ((len >> 8) & 0xff), (byte) (len & 0xff)};
        if (len < 0x10000000) return new byte[]{(byte) ((len >> 24) | 0xe0), (byte) ((len >> 16) & 0xff), (byte) ((len >> 8) & 0xff), (byte) (len & 0xff)};
        return new byte[]{(byte) 0xf0, (byte) ((len >>> 24) & 0xff), (byte) ((len >>> 16) & 0xff), (byte) ((len >>> 8) & 0xff), (byte) (len & 0xff)};
    }

    private static int readLength(InputStream in) throws Exception {
        int b0 = in.read();
        if (b0 < 0) throw new Exception("Socket closed by router");
        if ((b0 & 0x80) == 0x00) return b0;
        if ((b0 & 0xc0) == 0x80) return ((b0 & 0x3f) << 8) | in.read();
        if ((b0 & 0xe0) == 0xc0) return ((b0 & 0x1f) << 16) | (in.read() << 8) | in.read();
        if ((b0 & 0xf0) == 0xe0) return ((b0 & 0x0f) << 24) | (in.read() << 16) | (in.read() << 8) | in.read();
        return (in.read() << 24) | (in.read() << 16) | (in.read() << 8) | in.read();
    }

    private static void writeSentence(OutputStream out, List<String> words) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        for (String w : words) {
            byte[] wb = w.getBytes(StandardCharsets.UTF_8);
            buf.write(encodeLength(wb.length));
            buf.write(wb);
        }
        buf.write(0);
        out.write(buf.toByteArray());
        out.flush();
    }

    private static List<String> readSentence(InputStream in) throws Exception {
        List<String> words = new ArrayList<>();
        while (true) {
            int len = readLength(in);
            if (len == 0) break;
            byte[] data = new byte[len];
            int read = 0;
            while (read < len) {
                int r = in.read(data, read, len - read);
                if (r < 0) throw new Exception("Unexpected EOF reading RouterOS word");
                read += r;
            }
            words.add(new String(data, StandardCharsets.UTF_8));
        }
        return words;
    }

    private static JSArray runCommand(InputStream in, OutputStream out, List<String> words) throws Exception {
        writeSentence(out, words);
        JSArray rows = new JSArray();
        List<String> traps = new ArrayList<>();

        while (true) {
            List<String> reply = readSentence(in);
            if (reply.isEmpty()) continue;
            String type = reply.get(0);
            JSObject obj = new JSObject();
            for (int i = 1; i < reply.size(); i++) {
                String w = reply.get(i);
                if (w.startsWith("=")) {
                    int idx = w.indexOf('=', 1);
                    if (idx > 0) obj.put(w.substring(1, idx), w.substring(idx + 1));
                }
            }
            if ("!re".equals(type)) {
                rows.put(obj);
            } else if ("!trap".equals(type) || "!fatal".equals(type)) {
                traps.add(obj.getString("message", "RouterOS command error"));
            } else if ("!done".equals(type)) {
                if (!traps.isEmpty()) throw new Exception(String.join("; ", traps));
                return rows;
            }
        }
    }

    /**
     * Executes a batch of RouterOS Binary API commands over a single local Wi-Fi TCP connection.
     * Input: { host, port (default 8728), username, password, commands: [{ path, params }] }
     */
    @PluginMethod
    public void executeBatch(PluginCall call) {
        String host = call.getString("host", "192.168.88.1");
        int port = call.getInt("port", 8728);
        String username = call.getString("username", "admin");
        String password = call.getString("password", "");
        JSArray commands = call.getArray("commands");

        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, port), 6000);
                socket.setSoTimeout(10000);
                InputStream in = socket.getInputStream();
                OutputStream out = socket.getOutputStream();

                // Authenticate (RouterOS 6.43+ & v7)
                List<String> loginWords = new ArrayList<>();
                loginWords.add("/login");
                loginWords.add("=name=" + username);
                loginWords.add("=password=" + password);
                runCommand(in, out, loginWords);

                JSArray results = new JSArray();
                if (commands != null) {
                    for (int i = 0; i < commands.length(); i++) {
                        org.json.JSONObject item = commands.getJSONObject(i);
                        List<String> words = new ArrayList<>();
                        words.add(item.getString("path"));
                        if (item.has("params") && !item.isNull("params")) {
                            org.json.JSONObject params = item.getJSONObject("params");
                            Iterator<String> keys = params.keys();
                            while (keys.hasNext()) {
                                String k = keys.next();
                                words.add("=" + k + "=" + params.getString(k));
                            }
                        }
                        results.put(runCommand(in, out, words));
                    }
                }

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("results", results);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("RouterOS local connection failed: " + e.getMessage(), e);
            }
        }).start();
    }
}
