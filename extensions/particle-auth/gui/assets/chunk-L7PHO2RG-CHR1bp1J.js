import{i as ge,a as me,R as we,c as ye,d as pe}from"./chunk-SUWDRJLB-BRBb-rE_.js";import{bI as Ce,_ as Et,v as j,w as K,V as Ee,W,n as S,A as be,r as Be}from"./index-ppiGxaDG.js";import{r as Re}from"./dijkstra-C00ieaqj.js";var V={},Z,It;function Ae(){return It||(It=1,Z=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}),Z}var X={},U={},Mt;function k(){if(Mt)return U;Mt=1;let r;const o=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];return U.getSymbolSize=function(n){if(!n)throw new Error('"version" cannot be null or undefined');if(n<1||n>40)throw new Error('"version" should be in range from 1 to 40');return n*4+17},U.getSymbolTotalCodewords=function(n){return o[n]},U.getBCHDigit=function(i){let n=0;for(;i!==0;)n++,i>>>=1;return n},U.setToSJISFunction=function(n){if(typeof n!="function")throw new Error('"toSJISFunc" is not a valid function.');r=n},U.isKanjiModeEnabled=function(){return typeof r<"u"},U.toSJIS=function(n){return r(n)},U}var tt={},Tt;function bt(){return Tt||(Tt=1,function(r){r.L={bit:1},r.M={bit:0},r.Q={bit:3},r.H={bit:2};function o(i){if(typeof i!="string")throw new Error("Param is not a string");switch(i.toLowerCase()){case"l":case"low":return r.L;case"m":case"medium":return r.M;case"q":case"quartile":return r.Q;case"h":case"high":return r.H;default:throw new Error("Unknown EC Level: "+i)}}r.isValid=function(n){return n&&typeof n.bit<"u"&&n.bit>=0&&n.bit<4},r.from=function(n,t){if(r.isValid(n))return n;try{return o(n)}catch{return t}}}(tt)),tt}var et,Nt;function Ie(){if(Nt)return et;Nt=1;function r(){this.buffer=[],this.length=0}return r.prototype={get:function(o){const i=Math.floor(o/8);return(this.buffer[i]>>>7-o%8&1)===1},put:function(o,i){for(let n=0;n<i;n++)this.putBit((o>>>i-n-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(o){const i=Math.floor(this.length/8);this.buffer.length<=i&&this.buffer.push(0),o&&(this.buffer[i]|=128>>>this.length%8),this.length++}},et=r,et}var nt,St;function Me(){if(St)return nt;St=1;function r(o){if(!o||o<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=o,this.data=new Uint8Array(o*o),this.reservedBit=new Uint8Array(o*o)}return r.prototype.set=function(o,i,n,t){const e=o*this.size+i;this.data[e]=n,t&&(this.reservedBit[e]=!0)},r.prototype.get=function(o,i){return this.data[o*this.size+i]},r.prototype.xor=function(o,i,n){this.data[o*this.size+i]^=n},r.prototype.isReserved=function(o,i){return this.reservedBit[o*this.size+i]},nt=r,nt}var rt={},Pt;function Te(){return Pt||(Pt=1,function(r){const o=k().getSymbolSize;r.getRowColCoords=function(n){if(n===1)return[];const t=Math.floor(n/7)+2,e=o(n),s=e===145?26:Math.ceil((e-13)/(2*t-2))*2,a=[e-7];for(let u=1;u<t-1;u++)a[u]=a[u-1]-s;return a.push(6),a.reverse()},r.getPositions=function(n){const t=[],e=r.getRowColCoords(n),s=e.length;for(let a=0;a<s;a++)for(let u=0;u<s;u++)a===0&&u===0||a===0&&u===s-1||a===s-1&&u===0||t.push([e[a],e[u]]);return t}}(rt)),rt}var ot={},Lt;function Ne(){if(Lt)return ot;Lt=1;const r=k().getSymbolSize,o=7;return ot.getPositions=function(n){const t=r(n);return[[0,0],[t-o,0],[0,t-o]]},ot}var it={},vt;function Se(){return vt||(vt=1,function(r){r.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};const o={N1:3,N2:3,N3:40,N4:10};r.isValid=function(t){return t!=null&&t!==""&&!isNaN(t)&&t>=0&&t<=7},r.from=function(t){return r.isValid(t)?parseInt(t,10):void 0},r.getPenaltyN1=function(t){const e=t.size;let s=0,a=0,u=0,l=null,f=null;for(let c=0;c<e;c++){a=u=0,l=f=null;for(let R=0;R<e;R++){let d=t.get(c,R);d===l?a++:(a>=5&&(s+=o.N1+(a-5)),l=d,a=1),d=t.get(R,c),d===f?u++:(u>=5&&(s+=o.N1+(u-5)),f=d,u=1)}a>=5&&(s+=o.N1+(a-5)),u>=5&&(s+=o.N1+(u-5))}return s},r.getPenaltyN2=function(t){const e=t.size;let s=0;for(let a=0;a<e-1;a++)for(let u=0;u<e-1;u++){const l=t.get(a,u)+t.get(a,u+1)+t.get(a+1,u)+t.get(a+1,u+1);(l===4||l===0)&&s++}return s*o.N2},r.getPenaltyN3=function(t){const e=t.size;let s=0,a=0,u=0;for(let l=0;l<e;l++){a=u=0;for(let f=0;f<e;f++)a=a<<1&2047|t.get(l,f),f>=10&&(a===1488||a===93)&&s++,u=u<<1&2047|t.get(f,l),f>=10&&(u===1488||u===93)&&s++}return s*o.N3},r.getPenaltyN4=function(t){let e=0;const s=t.data.length;for(let u=0;u<s;u++)e+=t.data[u];return Math.abs(Math.ceil(e*100/s/5)-10)*o.N4};function i(n,t,e){switch(n){case r.Patterns.PATTERN000:return(t+e)%2===0;case r.Patterns.PATTERN001:return t%2===0;case r.Patterns.PATTERN010:return e%3===0;case r.Patterns.PATTERN011:return(t+e)%3===0;case r.Patterns.PATTERN100:return(Math.floor(t/2)+Math.floor(e/3))%2===0;case r.Patterns.PATTERN101:return t*e%2+t*e%3===0;case r.Patterns.PATTERN110:return(t*e%2+t*e%3)%2===0;case r.Patterns.PATTERN111:return(t*e%3+(t+e)%2)%2===0;default:throw new Error("bad maskPattern:"+n)}}r.applyMask=function(t,e){const s=e.size;for(let a=0;a<s;a++)for(let u=0;u<s;u++)e.isReserved(u,a)||e.xor(u,a,i(t,u,a))},r.getBestMask=function(t,e){const s=Object.keys(r.Patterns).length;let a=0,u=1/0;for(let l=0;l<s;l++){e(l),r.applyMask(l,t);const f=r.getPenaltyN1(t)+r.getPenaltyN2(t)+r.getPenaltyN3(t)+r.getPenaltyN4(t);r.applyMask(l,t),f<u&&(u=f,a=l)}return a}}(it)),it}var Q={},xt;function te(){if(xt)return Q;xt=1;const r=bt(),o=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],i=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];return Q.getBlocksCount=function(t,e){switch(e){case r.L:return o[(t-1)*4+0];case r.M:return o[(t-1)*4+1];case r.Q:return o[(t-1)*4+2];case r.H:return o[(t-1)*4+3];default:return}},Q.getTotalCodewordsCount=function(t,e){switch(e){case r.L:return i[(t-1)*4+0];case r.M:return i[(t-1)*4+1];case r.Q:return i[(t-1)*4+2];case r.H:return i[(t-1)*4+3];default:return}},Q}var st={},H={},Dt;function Pe(){if(Dt)return H;Dt=1;const r=new Uint8Array(512),o=new Uint8Array(256);return function(){let n=1;for(let t=0;t<255;t++)r[t]=n,o[n]=t,n<<=1,n&256&&(n^=285);for(let t=255;t<512;t++)r[t]=r[t-255]}(),H.log=function(n){if(n<1)throw new Error("log("+n+")");return o[n]},H.exp=function(n){return r[n]},H.mul=function(n,t){return n===0||t===0?0:r[o[n]+o[t]]},H}var qt;function Le(){return qt||(qt=1,function(r){const o=Pe();r.mul=function(n,t){const e=new Uint8Array(n.length+t.length-1);for(let s=0;s<n.length;s++)for(let a=0;a<t.length;a++)e[s+a]^=o.mul(n[s],t[a]);return e},r.mod=function(n,t){let e=new Uint8Array(n);for(;e.length-t.length>=0;){const s=e[0];for(let u=0;u<t.length;u++)e[u]^=o.mul(t[u],s);let a=0;for(;a<e.length&&e[a]===0;)a++;e=e.slice(a)}return e},r.generateECPolynomial=function(n){let t=new Uint8Array([1]);for(let e=0;e<n;e++)t=r.mul(t,new Uint8Array([1,o.exp(e)]));return t}}(st)),st}var at,Ut;function ve(){if(Ut)return at;Ut=1;const r=Le();function o(i){this.genPoly=void 0,this.degree=i,this.degree&&this.initialize(this.degree)}return o.prototype.initialize=function(n){this.degree=n,this.genPoly=r.generateECPolynomial(this.degree)},o.prototype.encode=function(n){if(!this.genPoly)throw new Error("Encoder not initialized");const t=new Uint8Array(n.length+this.degree);t.set(n);const e=r.mod(t,this.genPoly),s=this.degree-e.length;if(s>0){const a=new Uint8Array(this.degree);return a.set(e,s),a}return e},at=o,at}var ut={},ct={},lt={},kt;function ee(){return kt||(kt=1,lt.isValid=function(o){return!isNaN(o)&&o>=1&&o<=40}),lt}var v={},Ft;function ne(){if(Ft)return v;Ft=1;const r="[0-9]+",o="[A-Z $%*+\\-./:]+";let i="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";i=i.replace(/u/g,"\\u");const n="(?:(?![A-Z0-9 $%*+\\-./:]|"+i+`)(?:.|[\r
]))+`;v.KANJI=new RegExp(i,"g"),v.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g"),v.BYTE=new RegExp(n,"g"),v.NUMERIC=new RegExp(r,"g"),v.ALPHANUMERIC=new RegExp(o,"g");const t=new RegExp("^"+i+"$"),e=new RegExp("^"+r+"$"),s=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");return v.testKanji=function(u){return t.test(u)},v.testNumeric=function(u){return e.test(u)},v.testAlphanumeric=function(u){return s.test(u)},v}var zt;function F(){return zt||(zt=1,function(r){const o=ee(),i=ne();r.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},r.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},r.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},r.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},r.MIXED={bit:-1},r.getCharCountIndicator=function(e,s){if(!e.ccBits)throw new Error("Invalid mode: "+e);if(!o.isValid(s))throw new Error("Invalid version: "+s);return s>=1&&s<10?e.ccBits[0]:s<27?e.ccBits[1]:e.ccBits[2]},r.getBestModeForData=function(e){return i.testNumeric(e)?r.NUMERIC:i.testAlphanumeric(e)?r.ALPHANUMERIC:i.testKanji(e)?r.KANJI:r.BYTE},r.toString=function(e){if(e&&e.id)return e.id;throw new Error("Invalid mode")},r.isValid=function(e){return e&&e.bit&&e.ccBits};function n(t){if(typeof t!="string")throw new Error("Param is not a string");switch(t.toLowerCase()){case"numeric":return r.NUMERIC;case"alphanumeric":return r.ALPHANUMERIC;case"kanji":return r.KANJI;case"byte":return r.BYTE;default:throw new Error("Unknown mode: "+t)}}r.from=function(e,s){if(r.isValid(e))return e;try{return n(e)}catch{return s}}}(ct)),ct}var jt;function xe(){return jt||(jt=1,function(r){const o=k(),i=te(),n=bt(),t=F(),e=ee(),s=7973,a=o.getBCHDigit(s);function u(R,d,T){for(let N=1;N<=40;N++)if(d<=r.getCapacity(N,T,R))return N}function l(R,d){return t.getCharCountIndicator(R,d)+4}function f(R,d){let T=0;return R.forEach(function(N){const P=l(N.mode,d);T+=P+N.getBitsLength()}),T}function c(R,d){for(let T=1;T<=40;T++)if(f(R,T)<=r.getCapacity(T,d,t.MIXED))return T}r.from=function(d,T){return e.isValid(d)?parseInt(d,10):T},r.getCapacity=function(d,T,N){if(!e.isValid(d))throw new Error("Invalid QR Code version");typeof N>"u"&&(N=t.BYTE);const P=o.getSymbolTotalCodewords(d),m=i.getTotalCodewordsCount(d,T),M=(P-m)*8;if(N===t.MIXED)return M;const y=M-l(N,d);switch(N){case t.NUMERIC:return Math.floor(y/10*3);case t.ALPHANUMERIC:return Math.floor(y/11*2);case t.KANJI:return Math.floor(y/13);case t.BYTE:default:return Math.floor(y/8)}},r.getBestVersionForData=function(d,T){let N;const P=n.from(T,n.M);if(Array.isArray(d)){if(d.length>1)return c(d,P);if(d.length===0)return 1;N=d[0]}else N=d;return u(N.mode,N.getLength(),P)},r.getEncodedBits=function(d){if(!e.isValid(d)||d<7)throw new Error("Invalid QR Code version");let T=d<<12;for(;o.getBCHDigit(T)-a>=0;)T^=s<<o.getBCHDigit(T)-a;return d<<12|T}}(ut)),ut}var ft={},Vt;function De(){if(Vt)return ft;Vt=1;const r=k(),o=1335,i=21522,n=r.getBCHDigit(o);return ft.getEncodedBits=function(e,s){const a=e.bit<<3|s;let u=a<<10;for(;r.getBCHDigit(u)-n>=0;)u^=o<<r.getBCHDigit(u)-n;return(a<<10|u)^i},ft}var dt={},ht,Kt;function qe(){if(Kt)return ht;Kt=1;const r=F();function o(i){this.mode=r.NUMERIC,this.data=i.toString()}return o.getBitsLength=function(n){return 10*Math.floor(n/3)+(n%3?n%3*3+1:0)},o.prototype.getLength=function(){return this.data.length},o.prototype.getBitsLength=function(){return o.getBitsLength(this.data.length)},o.prototype.write=function(n){let t,e,s;for(t=0;t+3<=this.data.length;t+=3)e=this.data.substr(t,3),s=parseInt(e,10),n.put(s,10);const a=this.data.length-t;a>0&&(e=this.data.substr(t),s=parseInt(e,10),n.put(s,a*3+1))},ht=o,ht}var gt,_t;function Ue(){if(_t)return gt;_t=1;const r=F(),o=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function i(n){this.mode=r.ALPHANUMERIC,this.data=n}return i.getBitsLength=function(t){return 11*Math.floor(t/2)+6*(t%2)},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(t){let e;for(e=0;e+2<=this.data.length;e+=2){let s=o.indexOf(this.data[e])*45;s+=o.indexOf(this.data[e+1]),t.put(s,11)}this.data.length%2&&t.put(o.indexOf(this.data[e]),6)},gt=i,gt}var mt,Ht;function ke(){if(Ht)return mt;Ht=1;const r=F();function o(i){this.mode=r.BYTE,typeof i=="string"?this.data=new TextEncoder().encode(i):this.data=new Uint8Array(i)}return o.getBitsLength=function(n){return n*8},o.prototype.getLength=function(){return this.data.length},o.prototype.getBitsLength=function(){return o.getBitsLength(this.data.length)},o.prototype.write=function(i){for(let n=0,t=this.data.length;n<t;n++)i.put(this.data[n],8)},mt=o,mt}var wt,Jt;function Fe(){if(Jt)return wt;Jt=1;const r=F(),o=k();function i(n){this.mode=r.KANJI,this.data=n}return i.getBitsLength=function(t){return t*13},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(n){let t;for(t=0;t<this.data.length;t++){let e=o.toSJIS(this.data[t]);if(e>=33088&&e<=40956)e-=33088;else if(e>=57408&&e<=60351)e-=49472;else throw new Error("Invalid SJIS character: "+this.data[t]+`
Make sure your charset is UTF-8`);e=(e>>>8&255)*192+(e&255),n.put(e,13)}},wt=i,wt}var Qt;function ze(){return Qt||(Qt=1,function(r){const o=F(),i=qe(),n=Ue(),t=ke(),e=Fe(),s=ne(),a=k(),u=Re();function l(m){return unescape(encodeURIComponent(m)).length}function f(m,M,y){const h=[];let L;for(;(L=m.exec(y))!==null;)h.push({data:L[0],index:L.index,mode:M,length:L[0].length});return h}function c(m){const M=f(s.NUMERIC,o.NUMERIC,m),y=f(s.ALPHANUMERIC,o.ALPHANUMERIC,m);let h,L;return a.isKanjiModeEnabled()?(h=f(s.BYTE,o.BYTE,m),L=f(s.KANJI,o.KANJI,m)):(h=f(s.BYTE_KANJI,o.BYTE,m),L=[]),M.concat(y,h,L).sort(function(b,E){return b.index-E.index}).map(function(b){return{data:b.data,mode:b.mode,length:b.length}})}function R(m,M){switch(M){case o.NUMERIC:return i.getBitsLength(m);case o.ALPHANUMERIC:return n.getBitsLength(m);case o.KANJI:return e.getBitsLength(m);case o.BYTE:return t.getBitsLength(m)}}function d(m){return m.reduce(function(M,y){const h=M.length-1>=0?M[M.length-1]:null;return h&&h.mode===y.mode?(M[M.length-1].data+=y.data,M):(M.push(y),M)},[])}function T(m){const M=[];for(let y=0;y<m.length;y++){const h=m[y];switch(h.mode){case o.NUMERIC:M.push([h,{data:h.data,mode:o.ALPHANUMERIC,length:h.length},{data:h.data,mode:o.BYTE,length:h.length}]);break;case o.ALPHANUMERIC:M.push([h,{data:h.data,mode:o.BYTE,length:h.length}]);break;case o.KANJI:M.push([h,{data:h.data,mode:o.BYTE,length:l(h.data)}]);break;case o.BYTE:M.push([{data:h.data,mode:o.BYTE,length:l(h.data)}])}}return M}function N(m,M){const y={},h={start:{}};let L=["start"];for(let w=0;w<m.length;w++){const b=m[w],E=[];for(let g=0;g<b.length;g++){const A=b[g],p=""+w+g;E.push(p),y[p]={node:A,lastCount:0},h[p]={};for(let B=0;B<L.length;B++){const C=L[B];y[C]&&y[C].node.mode===A.mode?(h[C][p]=R(y[C].lastCount+A.length,A.mode)-R(y[C].lastCount,A.mode),y[C].lastCount+=A.length):(y[C]&&(y[C].lastCount=A.length),h[C][p]=R(A.length,A.mode)+4+o.getCharCountIndicator(A.mode,M))}}L=E}for(let w=0;w<L.length;w++)h[L[w]].end=0;return{map:h,table:y}}function P(m,M){let y;const h=o.getBestModeForData(m);if(y=o.from(M,h),y!==o.BYTE&&y.bit<h.bit)throw new Error('"'+m+'" cannot be encoded with mode '+o.toString(y)+`.
 Suggested mode is: `+o.toString(h));switch(y===o.KANJI&&!a.isKanjiModeEnabled()&&(y=o.BYTE),y){case o.NUMERIC:return new i(m);case o.ALPHANUMERIC:return new n(m);case o.KANJI:return new e(m);case o.BYTE:return new t(m)}}r.fromArray=function(M){return M.reduce(function(y,h){return typeof h=="string"?y.push(P(h,null)):h.data&&y.push(P(h.data,h.mode)),y},[])},r.fromString=function(M,y){const h=c(M,a.isKanjiModeEnabled()),L=T(h),w=N(L,y),b=u.find_path(w.map,"start","end"),E=[];for(let g=1;g<b.length-1;g++)E.push(w.table[b[g]].node);return r.fromArray(d(E))},r.rawSplit=function(M){return r.fromArray(c(M,a.isKanjiModeEnabled()))}}(dt)),dt}var $t;function je(){if($t)return X;$t=1;const r=k(),o=bt(),i=Ie(),n=Me(),t=Te(),e=Ne(),s=Se(),a=te(),u=ve(),l=xe(),f=De(),c=F(),R=ze();function d(w,b){const E=w.size,g=e.getPositions(b);for(let A=0;A<g.length;A++){const p=g[A][0],B=g[A][1];for(let C=-1;C<=7;C++)if(!(p+C<=-1||E<=p+C))for(let I=-1;I<=7;I++)B+I<=-1||E<=B+I||(C>=0&&C<=6&&(I===0||I===6)||I>=0&&I<=6&&(C===0||C===6)||C>=2&&C<=4&&I>=2&&I<=4?w.set(p+C,B+I,!0,!0):w.set(p+C,B+I,!1,!0))}}function T(w){const b=w.size;for(let E=8;E<b-8;E++){const g=E%2===0;w.set(E,6,g,!0),w.set(6,E,g,!0)}}function N(w,b){const E=t.getPositions(b);for(let g=0;g<E.length;g++){const A=E[g][0],p=E[g][1];for(let B=-2;B<=2;B++)for(let C=-2;C<=2;C++)B===-2||B===2||C===-2||C===2||B===0&&C===0?w.set(A+B,p+C,!0,!0):w.set(A+B,p+C,!1,!0)}}function P(w,b){const E=w.size,g=l.getEncodedBits(b);let A,p,B;for(let C=0;C<18;C++)A=Math.floor(C/3),p=C%3+E-8-3,B=(g>>C&1)===1,w.set(A,p,B,!0),w.set(p,A,B,!0)}function m(w,b,E){const g=w.size,A=f.getEncodedBits(b,E);let p,B;for(p=0;p<15;p++)B=(A>>p&1)===1,p<6?w.set(p,8,B,!0):p<8?w.set(p+1,8,B,!0):w.set(g-15+p,8,B,!0),p<8?w.set(8,g-p-1,B,!0):p<9?w.set(8,15-p-1+1,B,!0):w.set(8,15-p-1,B,!0);w.set(g-8,8,1,!0)}function M(w,b){const E=w.size;let g=-1,A=E-1,p=7,B=0;for(let C=E-1;C>0;C-=2)for(C===6&&C--;;){for(let I=0;I<2;I++)if(!w.isReserved(A,C-I)){let q=!1;B<b.length&&(q=(b[B]>>>p&1)===1),w.set(A,C-I,q),p--,p===-1&&(B++,p=7)}if(A+=g,A<0||E<=A){A-=g,g=-g;break}}}function y(w,b,E){const g=new i;E.forEach(function(I){g.put(I.mode.bit,4),g.put(I.getLength(),c.getCharCountIndicator(I.mode,w)),I.write(g)});const A=r.getSymbolTotalCodewords(w),p=a.getTotalCodewordsCount(w,b),B=(A-p)*8;for(g.getLengthInBits()+4<=B&&g.put(0,4);g.getLengthInBits()%8!==0;)g.putBit(0);const C=(B-g.getLengthInBits())/8;for(let I=0;I<C;I++)g.put(I%2?17:236,8);return h(g,w,b)}function h(w,b,E){const g=r.getSymbolTotalCodewords(b),A=a.getTotalCodewordsCount(b,E),p=g-A,B=a.getBlocksCount(b,E),C=g%B,I=B-C,q=Math.floor(g/B),_=Math.floor(p/B),fe=_+1,Bt=q-_,de=new u(Bt);let $=0;const J=new Array(B),Rt=new Array(B);let Y=0;const he=new Uint8Array(w.buffer);for(let z=0;z<B;z++){const G=z<I?_:fe;J[z]=he.slice($,$+G),Rt[z]=de.encode(J[z]),$+=G,Y=Math.max(Y,G)}const O=new Uint8Array(g);let At=0,x,D;for(x=0;x<Y;x++)for(D=0;D<B;D++)x<J[D].length&&(O[At++]=J[D][x]);for(x=0;x<Bt;x++)for(D=0;D<B;D++)O[At++]=Rt[D][x];return O}function L(w,b,E,g){let A;if(Array.isArray(w))A=R.fromArray(w);else if(typeof w=="string"){let q=b;if(!q){const _=R.rawSplit(w);q=l.getBestVersionForData(_,E)}A=R.fromString(w,q||40)}else throw new Error("Invalid data");const p=l.getBestVersionForData(A,E);if(!p)throw new Error("The amount of data is too big to be stored in a QR Code");if(!b)b=p;else if(b<p)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+p+`.
`);const B=y(b,E,A),C=r.getSymbolSize(b),I=new n(C);return d(I,b),T(I),N(I,b),m(I,E,0),b>=7&&P(I,b),M(I,B),isNaN(g)&&(g=s.getBestMask(I,m.bind(null,I,E))),s.applyMask(g,I),m(I,E,g),{modules:I,version:b,errorCorrectionLevel:E,maskPattern:g,segments:A}}return X.create=function(b,E){if(typeof b>"u"||b==="")throw new Error("No input text");let g=o.M,A,p;return typeof E<"u"&&(g=o.from(E.errorCorrectionLevel,o.M),A=l.from(E.version),p=s.from(E.maskPattern),E.toSJISFunc&&r.setToSJISFunction(E.toSJISFunc)),L(b,A,g,p)},X}var yt={},pt={},Yt;function re(){return Yt||(Yt=1,function(r){function o(i){if(typeof i=="number"&&(i=i.toString()),typeof i!="string")throw new Error("Color should be defined as hex string");let n=i.slice().replace("#","").split("");if(n.length<3||n.length===5||n.length>8)throw new Error("Invalid hex color: "+i);(n.length===3||n.length===4)&&(n=Array.prototype.concat.apply([],n.map(function(e){return[e,e]}))),n.length===6&&n.push("F","F");const t=parseInt(n.join(""),16);return{r:t>>24&255,g:t>>16&255,b:t>>8&255,a:t&255,hex:"#"+n.slice(0,6).join("")}}r.getOptions=function(n){n||(n={}),n.color||(n.color={});const t=typeof n.margin>"u"||n.margin===null||n.margin<0?4:n.margin,e=n.width&&n.width>=21?n.width:void 0,s=n.scale||4;return{width:e,scale:e?4:s,margin:t,color:{dark:o(n.color.dark||"#000000ff"),light:o(n.color.light||"#ffffffff")},type:n.type,rendererOpts:n.rendererOpts||{}}},r.getScale=function(n,t){return t.width&&t.width>=n+t.margin*2?t.width/(n+t.margin*2):t.scale},r.getImageWidth=function(n,t){const e=r.getScale(n,t);return Math.floor((n+t.margin*2)*e)},r.qrToImageData=function(n,t,e){const s=t.modules.size,a=t.modules.data,u=r.getScale(s,e),l=Math.floor((s+e.margin*2)*u),f=e.margin*u,c=[e.color.light,e.color.dark];for(let R=0;R<l;R++)for(let d=0;d<l;d++){let T=(R*l+d)*4,N=e.color.light;if(R>=f&&d>=f&&R<l-f&&d<l-f){const P=Math.floor((R-f)/u),m=Math.floor((d-f)/u);N=c[a[P*s+m]?1:0]}n[T++]=N.r,n[T++]=N.g,n[T++]=N.b,n[T]=N.a}}}(pt)),pt}var Ot;function Ve(){return Ot||(Ot=1,function(r){const o=re();function i(t,e,s){t.clearRect(0,0,e.width,e.height),e.style||(e.style={}),e.height=s,e.width=s,e.style.height=s+"px",e.style.width=s+"px"}function n(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}r.render=function(e,s,a){let u=a,l=s;typeof u>"u"&&(!s||!s.getContext)&&(u=s,s=void 0),s||(l=n()),u=o.getOptions(u);const f=o.getImageWidth(e.modules.size,u),c=l.getContext("2d"),R=c.createImageData(f,f);return o.qrToImageData(R.data,e,u),i(c,l,f),c.putImageData(R,0,0),l},r.renderToDataURL=function(e,s,a){let u=a;typeof u>"u"&&(!s||!s.getContext)&&(u=s,s=void 0),u||(u={});const l=r.render(e,s,u),f=u.type||"image/png",c=u.rendererOpts||{};return l.toDataURL(f,c.quality)}}(yt)),yt}var Ct={},Gt;function Ke(){if(Gt)return Ct;Gt=1;const r=re();function o(t,e){const s=t.a/255,a=e+'="'+t.hex+'"';return s<1?a+" "+e+'-opacity="'+s.toFixed(2).slice(1)+'"':a}function i(t,e,s){let a=t+e;return typeof s<"u"&&(a+=" "+s),a}function n(t,e,s){let a="",u=0,l=!1,f=0;for(let c=0;c<t.length;c++){const R=Math.floor(c%e),d=Math.floor(c/e);!R&&!l&&(l=!0),t[c]?(f++,c>0&&R>0&&t[c-1]||(a+=l?i("M",R+s,.5+d+s):i("m",u,0),u=0,l=!1),R+1<e&&t[c+1]||(a+=i("h",f),f=0)):u++}return a}return Ct.render=function(e,s,a){const u=r.getOptions(s),l=e.modules.size,f=e.modules.data,c=l+u.margin*2,R=u.color.light.a?"<path "+o(u.color.light,"fill")+' d="M0 0h'+c+"v"+c+'H0z"/>':"",d="<path "+o(u.color.dark,"stroke")+' d="'+n(f,l,u.margin)+'"/>',T='viewBox="0 0 '+c+" "+c+'"',P='<svg xmlns="http://www.w3.org/2000/svg" '+(u.width?'width="'+u.width+'" height="'+u.width+'" ':"")+T+' shape-rendering="crispEdges">'+R+d+`</svg>
`;return typeof a=="function"&&a(null,P),P},Ct}var Wt;function _e(){if(Wt)return V;Wt=1;const r=Ae(),o=je(),i=Ve(),n=Ke();function t(e,s,a,u,l){const f=[].slice.call(arguments,1),c=f.length,R=typeof f[c-1]=="function";if(!R&&!r())throw new Error("Callback required as last argument");if(R){if(c<2)throw new Error("Too few arguments provided");c===2?(l=a,a=s,s=u=void 0):c===3&&(s.getContext&&typeof l>"u"?(l=u,u=void 0):(l=u,u=a,a=s,s=void 0))}else{if(c<1)throw new Error("Too few arguments provided");return c===1?(a=s,s=u=void 0):c===2&&!s.getContext&&(u=a,a=s,s=void 0),new Promise(function(d,T){try{const N=o.create(a,u);d(e(N,s,u))}catch(N){T(N)}})}try{const d=o.create(a,u);l(null,e(d,s,u))}catch(d){l(d)}}return V.create=o.create,V.toCanvas=t.bind(null,i.render),V.toDataURL=t.bind(null,i.renderToDataURL),V.toString=t.bind(null,function(e,s,a){return n.render(e,a)}),V}var He=_e();const Je=Ce(He);function Qe({ecl:r="M",size:o=200,uri:i,clearArea:n=!1,image:t,imageBackground:e="transparent"}){const s=n?76:0,a=o-10*2,u=Be.useMemo(()=>{const l=[],f=oe(i,r),c=a/f.length;if([{x:0,y:0},{x:1,y:0},{x:0,y:1}].forEach(({x:P,y:m})=>{const M=(f.length-7)*c*P,y=(f.length-7)*c*m;for(let h=0;h<3;h++)l.push(S.jsx("rect",{fill:h%2!==0?"var(--pcm-body-background)":"var(--pcm-body-color)",rx:(h-2)*-5+(h===0?2:3),ry:(h-2)*-5+(h===0?2:3),width:c*(7-h*2),height:c*(7-h*2),x:M+c*h,y:y+c*h},`${h}-${P}-${m}`))}),t){const P=(f.length-7)*c*1,m=(f.length-7)*c*1;l.push(S.jsxs(S.Fragment,{children:[S.jsx("rect",{fill:e,rx:-2*-5+2,ry:-2*-5+2,width:c*(7-0*2),height:c*(7-0*2),x:P+c*0,y:m+c*0}),S.jsx("foreignObject",{width:c*(7-0*2),height:c*(7-0*2),x:P+c*0,y:m+c*0,children:S.jsx("div",{style:{borderRadius:-2*-5+2,overflow:"hidden"},children:t})})]}))}const d=Math.floor((s+25)/c),T=f.length/2-d/2,N=f.length/2+d/2-1;return f.forEach((P,m)=>{P.forEach((M,y)=>{f[m][y]&&(m<7&&y<7||m>f.length-8&&y<7||m<7&&y>f.length-8||(t||!(m>T&&m<N&&y>T&&y<N))&&l.push(S.jsx("circle",{cx:m*c+c/2,cy:y*c+c/2,fill:"var(--pcm-body-color)",r:c/3},`circle-${m}-${y}`)))})}),l},[r,a,i]);return S.jsxs("svg",{height:a,width:a,viewBox:`0 0 ${a} ${a}`,style:{width:a,height:a},children:[S.jsx("rect",{fill:"transparent",height:a,width:a}),u]})}var oe,$e=Et({"src/components/CustomQRCode/QRCode.tsx"(){oe=(r,o)=>{const i=Array.prototype.slice.call(Je.create(r,{errorCorrectionLevel:o}).modules.data,0),n=Math.sqrt(i.length);return i.reduce((t,e,s)=>(s%n===0?t.push([e]):t[t.length-1].push(e))&&t,[])}}}),ie,se,Zt,ae,ue,ce,le,Ye=Et({"src/components/CustomQRCode/styles.ts"(){ie=j(K.div)`
  z-index: 3;
  position: relative;
  overflow: hidden;
  height: 0;
  padding-bottom: 100% !important;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 1px 0 2px;
  border-radius: var(--pcm-rounded-lg);
  background: var(--pcm-body-background);
  box-shadow: 0 0 0 1px var(--pcm-button-border-color);
  backface-visibility: hidden;
  svg {
    display: block;
    max-width: 100%;
    width: 100%;
    height: auto;
  }
`,se=j(K.div)`
  position: absolute;
  inset: 13px;
  svg {
    width: 100% !important;
    height: auto !important;
  }
`,Zt=Ee`
  0%{ background-position: 100% 0; }
  100%{ background-position: -100% 0; }
`,ae=j(K.div)`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  > div {
    z-index: 4;
    position: relative;
    width: 28%;
    height: 28%;
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 0 0 7px #fff;
  }
  > span {
    z-index: 4;
    position: absolute;
    background: var(--pcm-body-color-secondary);
    border-radius: var(--pcm-rounded-lg);
    width: 13.25%;
    height: 13.25%;
    box-shadow: 0 0 0 4px #fff;
    &:before {
      content: '';
      position: absolute;
      inset: 9px;
      border-radius: 3px;
      box-shadow: 0 0 0 4px #fff;
    }
    &:nth-child(1) {
      top: 0;
      left: 0;
    }
    &:nth-child(2) {
      top: 0;
      right: 0;
    }
    &:nth-child(3) {
      bottom: 0;
      left: 0;
    }
  }
  &:before {
    z-index: 3;
    content: '';
    position: absolute;
    inset: 0;
    background: repeat;
    background-size: 1.888% 1.888%;
    background-image: radial-gradient(var(--pcm-body-color-secondary) 41%, transparent 41%);
  }
  &:after {
    z-index: 5;
    content: '';
    position: absolute;
    inset: 0;
    transform: scale(1.6) rotate(45deg);
    background-image: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 50%,
      rgba(255, 255, 255, 1),
      rgba(255, 255, 255, 0)
    );
    background-size: 200% 100%;
    animation: ${Zt} 1000ms linear infinite both;
    ${r=>r.$failed&&W`
        animation: none;
      `}
  }
`,ue=j(K.div)`
  z-index: 6;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: translateY(50%) scale(0.9999); // Shifting fix
`,ce=j(K.div)`
  z-index: 6;
  position: absolute;
  left: 50%;
  overflow: hidden;

  transform: translate(-50%, -50%) scale(0.9999); // Shifting fix

  svg {
    display: block;
    position: relative;
    width: 100%;
    height: 100% !important;
  }

  ${r=>r.$wcLogo?W`
          width: 29%;
          height: 20.5%;
        `:W`
          width: 24%;
          height: 24%;
          border-radius: 17px;
          &:before {
            pointer-events: none;
            z-index: 2;
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            /* box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.02); */
          }
        `}
`,le=j.div`
  position: absolute;
  width: 28px;
  height: 28px;
  top: 50%;
  left: 50%;
  transform: translate(12px, 12px);
  z-index: 10;
  border-radius: 9999px;
  cursor: pointer;
  button {
    width: 100%;
    height: 100%;
  }
`}});function Xt({value:r,image:o,imageBackground:i,ecl:n="M",imagePosition:t="center",failed:e,failedCallback:s}){const a=o;return S.jsxs(ie,{children:[e&&S.jsx(le,{children:S.jsx(we,{"aria-label":"Retry",initial:{opacity:0,scale:.8},animate:{opacity:1,scale:1},exit:{opacity:0,scale:.8},whileTap:{scale:.9},transition:{duration:.1},onClick:s,children:S.jsx(ye,{children:S.jsx(pe,{})})})}),S.jsxs(se,{children:[o&&S.jsx(ue,{children:S.jsx(ce,{$wcLogo:t!=="center",style:{background:t==="center"?i:void 0},children:a})}),S.jsx(be,{initial:!1,children:r?S.jsx(K.div,{initial:{opacity:0},animate:{opacity:1},exit:{opacity:0,position:"absolute",inset:[0,0]},transition:{duration:.2},children:S.jsx(Qe,{uri:r,size:288,ecl:n,clearArea:!!(t==="center"&&o)})},r):S.jsxs(ae,{initial:{opacity:.2},animate:{opacity:.2},exit:{opacity:0,position:"absolute",inset:[0,0]},transition:{duration:.2},$failed:e,children:[S.jsx("span",{}),S.jsx("span",{}),S.jsx("span",{}),S.jsx("div",{})]})})]})]})}var Oe,Xe=Et({"src/components/CustomQRCode/index.tsx"(){ge(),me(),$e(),Ye(),Xt.displayName="CustomQRCode",Oe=Xt}});export{Oe as C,Xe as i};
