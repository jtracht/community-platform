import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashPassword,verifyPassword,encrypt,decrypt,verifyTotp} from '../apps/server/src/auth.js';
import * as OTPAuth from 'otpauth';
test('Passwords are salted and verified without plain text storage',()=>{const h=hashPassword('correct horse battery staple');assert.ok(verifyPassword('correct horse battery staple',h));assert.ok(!verifyPassword('wrong',h));assert.notEqual(hashPassword('same'),hashPassword('same'));});
test('TOTP secrets are authenticated-encrypted and codes validated',()=>{process.env.SESSION_SECRET='test-only-secret-at-least-32-characters';const secret=new OTPAuth.Secret({size:20});const encrypted=encrypt(secret.base32);assert.equal(decrypt(encrypted),secret.base32);assert.throws(()=>decrypt(encrypted.slice(0,-2)+'ff'));const otp=new OTPAuth.TOTP({secret});assert.notEqual(verifyTotp(secret.base32,otp.generate()),null);});
