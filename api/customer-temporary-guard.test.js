import test from 'node:test';
import assert from 'node:assert/strict';
import { temporarySignupAllowed } from './customer.js';

function withEnvironment(values, fn) {
  const keys=['ENABLE_TEMP_PHONE_SIGNUP','VERCEL_ENV','SUPABASE_URL','ELMARWA_TEMP_SIGNUP_TEST_DB_REF','ELMARWA_TEST_DATA_ACK'];
  const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try {
    for(const k of keys) {
      if(values[k]===undefined)delete process.env[k];
      else process.env[k]=values[k];
    }
    fn();
  } finally {
    for(const k of keys) {
      if(previous[k]===undefined)delete process.env[k];
      else process.env[k]=previous[k];
    }
  }
}
test('provisional signup is disabled by default',()=>{
  withEnvironment({VERCEL_ENV:'preview'},()=>assert.equal(temporarySignupAllowed(),false));
});
test('live Supabase project is blocked in Preview even with both flags',()=>{
  withEnvironment({
    ENABLE_TEMP_PHONE_SIGNUP:'true',VERCEL_ENV:'preview',
    SUPABASE_URL:'https://oosihqinkatldjmciutu.supabase.co',
    ELMARWA_TEMP_SIGNUP_TEST_DB_REF:'oosihqinkatldjmciutu'
  },()=>assert.equal(temporarySignupAllowed(),false));
});
test('owner-approved trial database can support Preview registration but not without explicit acknowledgement',()=>{
  const config={
    ENABLE_TEMP_PHONE_SIGNUP:'true',
    VERCEL_ENV:'preview',
    SUPABASE_URL:'https://oosihqinkatldjmciutu.supabase.co',
    ELMARWA_TEMP_SIGNUP_TEST_DB_REF:'oosihqinkatldjmciutu'
  };
  withEnvironment(config,()=>assert.equal(temporarySignupAllowed(),false));
  withEnvironment({...config,ELMARWA_TEST_DATA_ACK:'true'},
    ()=>assert.equal(temporarySignupAllowed(),true));
  withEnvironment({...config,ELMARWA_TEST_DATA_ACK:'false'},
    ()=>assert.equal(temporarySignupAllowed(),false));
  withEnvironment({...config,ELMARWA_TEST_DATA_ACK:'true',VERCEL_ENV:'production'},
    ()=>assert.equal(temporarySignupAllowed(),false));
});
test('Preview requires an exact, explicitly isolated Supabase reference',()=>{
  const settings={ENABLE_TEMP_PHONE_SIGNUP:'true',VERCEL_ENV:'preview',
    SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co'};
  withEnvironment(settings,()=>assert.equal(temporarySignupAllowed(),false));
  withEnvironment({...settings,ELMARWA_TEMP_SIGNUP_TEST_DB_REF:'zyxwvutsrqponmlkjihg'},
    ()=>assert.equal(temporarySignupAllowed(),false));
  withEnvironment({...settings,ELMARWA_TEMP_SIGNUP_TEST_DB_REF:'abcdefghijklmnopqrst'},
    ()=>assert.equal(temporarySignupAllowed(),true));
});
test('Vercel production can never activate provisional phone enrollment',()=>{
  withEnvironment({ENABLE_TEMP_PHONE_SIGNUP:'true',VERCEL_ENV:'production',
    SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
    ELMARWA_TEMP_SIGNUP_TEST_DB_REF:'abcdefghijklmnopqrst'},
    ()=>assert.equal(temporarySignupAllowed(),false));
});
