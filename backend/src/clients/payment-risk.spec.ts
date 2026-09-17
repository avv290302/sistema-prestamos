jest.mock('../generated/prisma/client',()=>({Prisma:{sql:jest.fn()}}));
import {paymentRisk} from './payment-risk';
import {validateDocument} from './client-document';
describe('Payment punctuality boundaries',()=>{
 it.each([[0,0,0,'GRAY'],[0,0,1,'GREEN'],[1,0,1,'YELLOW'],[7,0,1,'YELLOW'],[8,0,1,'RED'],[0,5,1,'YELLOW'],[0,8,1,'RED']])('classifies current %s / history %s / observations %s',(current,history,count,color)=>{
  expect(paymentRisk(Number(current),Number(history),Number(count),100).color).toBe(color);
 });
});
describe('Private client documents',()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
 it('checks bytes instead of trusting the file extension',()=>{
  const input={buffer:png,originalname:'../foto.png',mimetype:'image/png',size:png.length};
  expect(validateDocument('PHOTO',input).mimeType).toBe('image/png');
  expect(validateDocument('PHOTO',input).fileName).not.toContain('/');
  expect(()=>validateDocument('PHOTO',{...input,buffer:Buffer.from('<svg>script</svg>')})).toThrow();
  expect(()=>validateDocument('PHOTO',{...input,mimetype:'application/pdf'})).toThrow();
  expect(()=>validateDocument('INE',{...input,size:5242881})).toThrow();
  expect(()=>validateDocument('OTHER',input)).toThrow();
  expect(()=>validateDocument('PHOTO',undefined)).toThrow();
 });
});
