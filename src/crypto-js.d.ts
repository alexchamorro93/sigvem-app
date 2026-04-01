// Tipos para crypto-js
declare module 'crypto-js' {
  namespace AES {
    interface Result {
      toString(): string;
    }
    function encrypt(plaintext: string, key: string): Result;
    function decrypt(ciphertext: string, key: string): Result;
  }

  namespace enc {
    function Utf8(text: string): string;
    const Utf8: {
      stringify(words: any): string;
      parse(text: string): any;
    };
  }

  namespace SHA256 {
    interface Result {
      toString(): string;
    }
    function toString(): string;
  }
  function SHA256(text: string): {
    toString(): string;
  };

  function HmacSHA256(message: string, secret: string): {
    toString(): string;
  };
}
