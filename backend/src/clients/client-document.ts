import { BadRequestException } from '@nestjs/common';
export interface ClientUpload { buffer:Buffer;originalname:string;mimetype:string;size:number }
export function validateDocument(kind:string,file:ClientUpload|undefined) {
  if(!['PHOTO','INE'].includes(kind))throw new BadRequestException('Tipo de documento inválido.');
  if(!file||file.size<1||file.size>5*1024*1024||file.buffer.length!==file.size)throw new BadRequestException('Selecciona un archivo de hasta 5 MB.');
  const b=file.buffer;
  const mime=b.length>=24&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png'
    :b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255&&b[b.length-2]===255&&b[b.length-1]===217?'image/jpeg'
    :b.length>=16&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'?'image/webp'
    :b.length>=10&&b.toString('ascii',0,5)==='%PDF-'?'application/pdf':null;
  if(!mime||file.mimetype!==mime||(kind==='PHOTO'&&mime==='application/pdf'))throw new BadRequestException('La foto admite JPG, PNG o WebP. La INE también admite PDF. El contenido debe coincidir con el tipo de archivo.');
  // oxlint-disable-next-line no-control-regex -- Strip unsafe filename control characters.
  const fileName=file.originalname.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200)||'documento';
  return {fileName,mimeType:mime,size:b.length,data:new Uint8Array(b)};
}
