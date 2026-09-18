import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'BAFFA — بَفّة | لعبة الدومينو المصرية الأصلية',
  description: 'منصة بَفّة للعبة الدومينو المصرية الحقيقية 2 ضد 2 - رص بالحب، حريف قفلات، ولعب على أصوله!',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/favicon.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window === 'undefined') return;
                function isExtensionError(err, msg, file, stack) {
                  try {
                    var str = ((err && (err.stack || err.message)) || '') + ' ' + (msg || '') + ' ' + (file || '') + ' ' + (stack || '');
                    return str.indexOf('chrome-extension://') !== -1 ||
                           str.indexOf('M_ID') !== -1 ||
                           str.indexOf('pphgdbgldlmicfdkhondlafkiomnelnk') !== -1 ||
                           str.indexOf('executors/200.js') !== -1;
                  } catch(e) { return false; }
                }

                window.addEventListener('error', function(e) {
                  if (isExtensionError(e.error, e.message, e.filename, e.error && e.error.stack)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);

                window.addEventListener('unhandledrejection', function(e) {
                  var reason = e.reason;
                  if (isExtensionError(reason, reason && reason.message, '', reason && reason.stack)) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                    return true;
                  }
                }, true);

                var origConsoleError = console.error;
                console.error = function() {
                  try {
                    var combined = Array.prototype.slice.call(arguments).map(function(a) {
                      return (a && (a.stack || a.message || (typeof a === 'string' ? a : ''))) || '';
                    }).join(' ');
                    if (isExtensionError(null, combined, '', '')) {
                      return;
                    }
                  } catch(e) {}
                  origConsoleError.apply(console, arguments);
                };
              })();
            `,
          }}
        />
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
