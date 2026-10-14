package br.com.promocoesdoveras.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;

/**
 * App Android do Promocoes do Veras: abre o site em tela cheia.
 * Tudo o que muda no site aparece no app na hora, sem precisar atualizar o APK.
 * Links das ofertas (lojas), WhatsApp, Telegram e Instagram abrem no app de cada um.
 */
public class MainActivity extends Activity {

    private static final String HOME = "https://promocoesdoveras.com.br/?app=android";
    private static final String[] OWN_HOSTS = {
        "promocoesdoveras.com.br", "www.promocoesdoveras.com.br", "telegramsitepromocao.vercel.app"
    };

    private WebView web;
    private ProgressBar progress;
    private boolean showingOffline = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#0b0d12"));

        web = new WebView(this);
        web.setBackgroundColor(Color.TRANSPARENT);
        root.addView(web, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setIndeterminate(false);
        progress.getProgressDrawable().setTint(Color.parseColor("#ff7a1a"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(3));
        root.addView(progress, lp);

        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false); // links "_blank" passam pelo shouldOverrideUrlLoading
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setUserAgentString(s.getUserAgentString() + " PromocoesVerasApp/1.0");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progress.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progress.setProgress(newProgress);
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(startUrl(getIntent()));
        }
    }

    // Um link do site aberto de fora (ex.: /oferta/123) abre direto nessa pagina.
    private String startUrl(Intent intent) {
        if (intent != null && Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null
                && isOwnHost(intent.getData().getHost())) {
            return intent.getData().toString();
        }
        return HOME;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (Intent.ACTION_VIEW.equals(intent.getAction()) && intent.getData() != null) {
            web.loadUrl(startUrl(intent));
        }
    }

    private static boolean isOwnHost(String host) {
        if (host == null) return false;
        for (String h : OWN_HOSTS) if (h.equalsIgnoreCase(host)) return true;
        return false;
    }

    /** true = o app trata o link (fora do WebView); false = abre dentro do app. */
    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if ((scheme.equals("https") || scheme.equals("http")) && isOwnHost(uri.getHost())) {
            showingOffline = false;
            return false;
        }
        try {
            Intent intent;
            if (scheme.equals("intent")) {
                intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME);
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setComponent(null);
                intent.setSelector(null);
            } else {
                intent = new Intent(Intent.ACTION_VIEW, uri);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (ActivityNotFoundException | java.net.URISyntaxException e) {
            // Sem app para esse link: tenta no navegador, se for http(s).
            if (scheme.equals("https") || scheme.equals("http")) {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) { }
            }
        }
        return true;
    }

    private void showOffline() {
        showingOffline = true;
        String html = "<!doctype html><html><head><meta charset='utf-8'>"
            + "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            + "<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;"
            + "background:#0b0d12;color:#eef0f3;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box}"
            + "button{margin-top:18px;background:#ff7a1a;color:#fff;border:0;border-radius:14px;padding:14px 26px;"
            + "font-size:16px;font-weight:800}</style></head><body><div><div style='font-size:52px'>📡</div>"
            + "<h2>Sem conexão</h2><p style='color:#8b93a1'>Confira sua internet para ver as ofertas de agora.</p>"
            + "<button onclick=\"location.href='" + HOME + "'\">Tentar de novo</button></div></body></html>";
        web.loadDataWithBaseURL("https://promocoesdoveras.com.br/", html, "text/html", "utf-8", null);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack() && !showingOffline) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }
}
