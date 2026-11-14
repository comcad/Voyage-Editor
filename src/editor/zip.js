/**
 * Zip files, written and read in the page: just enough for a map's zip. Each file is packed with the browser's own
 * deflate when that makes it smaller (pictures and music hardly shrink, so they are kept as they are). Reading takes
 * files packed either way, as any zip program makes them.
 */
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return await through(bytes, new CompressionStream('deflate-raw')); } catch { return null; }
}
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser can’t unpack a compressed zip');
  return through(bytes, new DecompressionStream('deflate-raw'));
}
/** A time as a zip keeps it: two 16-bit numbers, local time, to the even second. */
function dosTime(d) {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** A zip of `files` ([[name, Uint8Array]]), as a Blob. */
export async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [], { time, date } = dosTime(new Date());
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name), crc = crc32(data), packed = await deflate(data);
    const method = packed && packed.length < data.length ? 8 : 0, body = method ? packed : data;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true);
    local.setUint16(10, time, true); local.setUint16(12, date, true); local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true); local.setUint32(22, data.length, true); local.setUint16(26, nameBytes.length, true);
    parts.push(local, nameBytes, body);
    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true); entry.setUint16(4, 20, true); entry.setUint16(6, 20, true); entry.setUint16(8, 0x0800, true); entry.setUint16(10, method, true);
    entry.setUint16(12, time, true); entry.setUint16(14, date, true); entry.setUint32(16, crc, true);
    entry.setUint32(20, body.length, true); entry.setUint32(24, data.length, true); entry.setUint16(28, nameBytes.length, true); entry.setUint32(42, offset, true);
    central.push(entry, nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const size = central.reduce((n, p) => n + p.byteLength, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/** The files in a zip (a Blob or File): a Map of name -> Uint8Array. Throws saying what is wrong with it. */
export async function readZip(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error('it is not a zip file');
  const count = dv.getUint16(end + 10, true), dec = new TextDecoder(), out = new Map();
  let p = dv.getUint32(end + 16, true);
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || dv.getUint32(p, true) !== 0x02014b50) throw new Error('the zip is damaged');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true), full = dv.getUint32(p + 24, true), at = dv.getUint32(p + 42, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (name.endsWith('/')) continue;   // (a folder)
    if (flags & 1) throw new Error(`${name} is locked with a password`);
    const start = at + 30 + dv.getUint16(at + 26, true) + dv.getUint16(at + 28, true), body = buf.subarray(start, start + size);
    if (body.length !== size) throw new Error('the zip is damaged');
    const data = method === 0 ? body : method === 8 ? await inflate(body) : null;
    if (!data) throw new Error(`${name} is packed in a way this can’t read`);
    if (data.length !== full || crc32(data) !== crc) throw new Error(`${name} is damaged`);
    out.set(name, data);
  }
  return out;
}
