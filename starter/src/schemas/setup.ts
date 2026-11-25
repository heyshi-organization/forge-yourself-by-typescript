import { z } from 'zod';

// Zodの既定のエラーメッセージを日本語にする(import しただけで有効になる)。
// 各スキーマに書いたカスタムメッセージは、そのまま優先される。
z.config(z.locales.ja());
