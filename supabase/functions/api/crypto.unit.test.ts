import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1';
import { decryptPayUni, encryptPayUni, generatePayUniHash } from './crypto.ts';

const KEY = '0123456789abcdef0123456789abcdef';
const IV = '0123456789ab';

Deno.test('encryptPayUni -> decryptPayUni round-trips the original payload', async () => {
  const payload = { MerchantID: 'TESTMID', Amt: 1000, TradeNo: 'ORDER123' };

  const encrypted = await encryptPayUni(payload, KEY, IV);
  const decrypted = await decryptPayUni(encrypted, KEY, IV);

  const params = new URLSearchParams(decrypted);
  assertEquals(params.get('MerchantID'), 'TESTMID');
  assertEquals(params.get('Amt'), '1000');
  assertEquals(params.get('TradeNo'), 'ORDER123');
});

Deno.test('generatePayUniHash is deterministic and uppercase hex', async () => {
  const encrypted = await encryptPayUni({ foo: 'bar' }, KEY, IV);

  const hash1 = await generatePayUniHash(encrypted, KEY, IV);
  const hash2 = await generatePayUniHash(encrypted, KEY, IV);

  assertEquals(hash1, hash2);
  assertEquals(hash1, hash1.toUpperCase());
  assertEquals(/^[0-9A-F]+$/.test(hash1), true);
});

Deno.test('generatePayUniHash changes when the ciphertext changes', async () => {
  const encryptedA = await encryptPayUni({ foo: 'bar' }, KEY, IV);
  const encryptedB = await encryptPayUni({ foo: 'baz' }, KEY, IV);

  const hashA = await generatePayUniHash(encryptedA, KEY, IV);
  const hashB = await generatePayUniHash(encryptedB, KEY, IV);

  assertNotEquals(hashA, hashB);
});
