import{r as Oe,t as ft}from"./chunk-UD6Q2AOH-DsQGa4dk.js";import{z as vt,u as bt,j as ze}from"./loginAccount-QCMUZ6H6-CjiSdZuY.js";import{w as gt}from"./chunk-SL2KVVUD-D0vEhO6V.js";import{N as ht}from"./chunk-CHA6AH7V-Bh_Ms4Al.js";import{b5 as Re,a$ as yt,b6 as xt,b7 as Ye,b8 as Ze,r,b9 as H,ba as N,bb as he,bc as wt,bd as je,be as Nt,bf as ie,bg as Je,bh as Ee,bi as St,bj as ve,bk as Et,bl as It,bm as kt,bn as Ct,bo as _t,bp as qe,bq as Le,br as Ue,W as Qe,Z as Rt,x as Dt,N as Ft,V as Vt,z as Mt,o as p,A as be,D as et,e as $t,y as At,a0 as Ie,C as He,I as We,bs as Tt}from"./index-CaXbrBtJ.js";import{u as Pt}from"./useRequest-BnTYF8DM.js";import{F as W,I as Ce}from"./index-D-AYJ3bw.js";import{R as tt}from"./DownOutlined-Cm92TueG.js";import{R as Bt}from"./UpOutlined-BtmIQjEf.js";import{i as Ot}from"./colors-D_r1Oo9l.js";import{g as ke,a as zt}from"./TextArea-B2nks7hq.js";import"./chunk-GKIRU5P2-B6ZqBHrn.js";import"./throttle-CnyNgHA9.js";import"./index-DCYoqd6f.js";var jt=function(e){return e.every(function(n){var t=Re(n);return t?t.getRootNode()instanceof ShadowRoot:!1})},qt=function(e){return e?e.getRootNode():document},Lt=function(e){if(!e||!document.getRootNode)return document;var n=Array.isArray(e)?e:[e];return jt(n)?qt(Re(n[0])):document};function Ut(e,n,t){t===void 0&&(t="click");var i=yt(e);xt(function(){var a=function(s){var g=Array.isArray(n)?n:[n];g.some(function(w){var f=Re(w);return!f||f.contains(s.target)})||i.current(s)},u=Lt(n),h=Array.isArray(t)?t:[t];return h.forEach(function(s){return u.addEventListener(s,a)}),function(){h.forEach(function(s){return u.removeEventListener(s,a)})}},Array.isArray(t)?t:[t],n)}function _e(){return typeof BigInt=="function"}function K(e){var n=e.trim(),t=n.startsWith("-");t&&(n=n.slice(1)),n=n.replace(/(\.\d*[^0])0*$/,"$1").replace(/\.0*$/,"").replace(/^0+/,""),n.startsWith(".")&&(n="0".concat(n));var i=n||"0",a=i.split("."),u=a[0]||"0",h=a[1]||"0";u==="0"&&h==="0"&&(t=!1);var s=t?"-":"";return{negative:t,negativeStr:s,trimStr:i,integerStr:u,decimalStr:h,fullStr:"".concat(s).concat(i)}}function De(e){var n=String(e);return!Number.isNaN(Number(n))&&n.includes("e")}function oe(e){var n=String(e);if(De(e)){var t=Number(n.slice(n.indexOf("e-")+2)),i=n.match(/\.(\d+)/);return i!=null&&i[1]&&(t+=i[1].length),t}return n.includes(".")&&Fe(n)?n.length-n.indexOf(".")-1:0}function ye(e){var n=String(e);if(De(e)){if(e>Number.MAX_SAFE_INTEGER)return String(_e()?BigInt(e).toString():Number.MAX_SAFE_INTEGER);if(e<Number.MIN_SAFE_INTEGER)return String(_e()?BigInt(e).toString():Number.MIN_SAFE_INTEGER);n=e.toFixed(oe(n))}return K(n).fullStr}function Fe(e){return typeof e=="number"?!Number.isNaN(e):e?/^\s*-?\d+(\.\d+)?\s*$/.test(e)||/^\s*-?\d+\.\s*$/.test(e)||/^\s*-?\.\d+\s*$/.test(e):!1}function Ke(e){var n=typeof e=="number"?ye(e):K(e).fullStr,t=n.includes(".");return t?K(n.replace(/(\d)\.(\d)/g,"$1$2.")).fullStr:e+"0"}var Ht=function(){function e(n){if(Ze(this,e),this.origin="",this.number=void 0,this.empty=void 0,!n&&n!==0||!String(n).trim()){this.empty=!0;return}this.origin=String(n),this.number=Number(n)}return Ye(e,[{key:"negate",value:function(){return new e(-this.toNumber())}},{key:"add",value:function(t){if(this.isInvalidate())return new e(t);var i=Number(t);if(Number.isNaN(i))return this;var a=this.number+i;if(a>Number.MAX_SAFE_INTEGER)return new e(Number.MAX_SAFE_INTEGER);if(a<Number.MIN_SAFE_INTEGER)return new e(Number.MIN_SAFE_INTEGER);var u=Math.max(oe(this.number),oe(i));return new e(a.toFixed(u))}},{key:"isEmpty",value:function(){return this.empty}},{key:"isNaN",value:function(){return Number.isNaN(this.number)}},{key:"isInvalidate",value:function(){return this.isEmpty()||this.isNaN()}},{key:"equals",value:function(t){return this.toNumber()===(t==null?void 0:t.toNumber())}},{key:"lessEquals",value:function(t){return this.add(t.negate().toString()).toNumber()<=0}},{key:"toNumber",value:function(){return this.number}},{key:"toString",value:function(){var t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:!0;return t?this.isInvalidate()?"":ye(this.number):this.origin}}]),e}(),Wt=function(){function e(n){if(Ze(this,e),this.origin="",this.negative=void 0,this.integer=void 0,this.decimal=void 0,this.decimalLen=void 0,this.empty=void 0,this.nan=void 0,!n&&n!==0||!String(n).trim()){this.empty=!0;return}if(this.origin=String(n),n==="-"){this.nan=!0;return}var t=n;if(De(t)&&(t=Number(t)),t=typeof t=="string"?t:ye(t),Fe(t)){var i=K(t);this.negative=i.negative;var a=i.trimStr.split(".");this.integer=BigInt(a[0]);var u=a[1]||"0";this.decimal=BigInt(u),this.decimalLen=u.length}else this.nan=!0}return Ye(e,[{key:"getMark",value:function(){return this.negative?"-":""}},{key:"getIntegerStr",value:function(){return this.integer.toString()}},{key:"getDecimalStr",value:function(){return this.decimal.toString().padStart(this.decimalLen,"0")}},{key:"alignDecimal",value:function(t){var i="".concat(this.getMark()).concat(this.getIntegerStr()).concat(this.getDecimalStr().padEnd(t,"0"));return BigInt(i)}},{key:"negate",value:function(){var t=new e(this.toString());return t.negative=!t.negative,t}},{key:"add",value:function(t){if(this.isInvalidate())return new e(t);var i=new e(t);if(i.isInvalidate())return this;var a=Math.max(this.getDecimalStr().length,i.getDecimalStr().length),u=this.alignDecimal(a),h=i.alignDecimal(a),s=(u+h).toString(),g=K(s),w=g.negativeStr,f=g.trimStr,v="".concat(w).concat(f.padStart(a+1,"0"));return new e("".concat(v.slice(0,-a),".").concat(v.slice(-a)))}},{key:"isEmpty",value:function(){return this.empty}},{key:"isNaN",value:function(){return this.nan}},{key:"isInvalidate",value:function(){return this.isEmpty()||this.isNaN()}},{key:"equals",value:function(t){return this.toString()===(t==null?void 0:t.toString())}},{key:"lessEquals",value:function(t){return this.add(t.negate().toString()).toNumber()<=0}},{key:"toNumber",value:function(){return this.isNaN()?NaN:Number(this.toString())}},{key:"toString",value:function(){var t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:!0;return t?this.isInvalidate()?"":K("".concat(this.getMark()).concat(this.getIntegerStr(),".").concat(this.getDecimalStr())).fullStr:this.origin}}]),e}();function A(e){return _e()?new Wt(e):new Ht(e)}function ge(e,n,t){var i=arguments.length>3&&arguments[3]!==void 0?arguments[3]:!1;if(e==="")return"";var a=K(e),u=a.negativeStr,h=a.integerStr,s=a.decimalStr,g="".concat(n).concat(s),w="".concat(u).concat(h);if(t>=0){var f=Number(s[t]);if(f>=5&&!i){var v=A(e).add("".concat(u,"0.").concat("0".repeat(t)).concat(10-f));return ge(v.toString(),n,t,i)}return t===0?w:"".concat(w).concat(n).concat(s.padEnd(t,"0").slice(0,t))}return g===".0"?w:"".concat(w).concat(g)}var Kt=200,Gt=600;function Xt(e){var n=e.prefixCls,t=e.upNode,i=e.downNode,a=e.upDisabled,u=e.downDisabled,h=e.onStep,s=r.useRef(),g=r.useRef();g.current=h;var w=function(I,R){I.preventDefault(),g.current(R);function S(){g.current(R),s.current=setTimeout(S,Kt)}s.current=setTimeout(S,Gt)},f=function(){clearTimeout(s.current)};if(r.useEffect(function(){return f},[]),Ot())return null;var v="".concat(n,"-handler"),E=H(v,"".concat(v,"-up"),N({},"".concat(v,"-up-disabled"),a)),k=H(v,"".concat(v,"-down"),N({},"".concat(v,"-down-disabled"),u)),c={unselectable:"on",role:"button",onMouseUp:f,onMouseLeave:f};return r.createElement("div",{className:"".concat(v,"-wrap")},r.createElement("span",he({},c,{onMouseDown:function(I){w(I,!0)},"aria-label":"Increase Value","aria-disabled":a,className:E}),t||r.createElement("span",{unselectable:"on",className:"".concat(n,"-handler-up-inner")})),r.createElement("span",he({},c,{onMouseDown:function(I){w(I,!1)},"aria-label":"Decrease Value","aria-disabled":u,className:k}),i||r.createElement("span",{unselectable:"on",className:"".concat(n,"-handler-down-inner")})))}function Yt(e,n){var t=r.useRef(null);function i(){try{var u=e.selectionStart,h=e.selectionEnd,s=e.value,g=s.substring(0,u),w=s.substring(h);t.current={start:u,end:h,value:s,beforeTxt:g,afterTxt:w}}catch{}}function a(){if(e&&t.current&&n)try{var u=e.value,h=t.current,s=h.beforeTxt,g=h.afterTxt,w=h.start,f=u.length;if(u.endsWith(g))f=u.length-t.current.afterTxt.length;else if(u.startsWith(s))f=s.length;else{var v=s[w-1],E=u.indexOf(v,w-1);E!==-1&&(f=E+1)}e.setSelectionRange(f,f)}catch(k){wt(!1,"Something warning of cursor restore. Please fire issue about this: ".concat(k.message))}}return[i,a]}const Zt=function(){var e=r.useRef(0),n=function(){je.cancel(e.current)};return r.useEffect(function(){return n},[]),function(t){n(),e.current=je(function(){t()})}};var Jt=["prefixCls","className","style","min","max","step","defaultValue","value","disabled","readOnly","upHandler","downHandler","keyboard","controls","stringMode","parser","formatter","precision","decimalSeparator","onChange","onInput","onPressEnter","onStep"],Ge=function(n,t){return n||t.isEmpty()?t.toString():t.toNumber()},Xe=function(n){var t=A(n);return t.isInvalidate()?null:t},nt=r.forwardRef(function(e,n){var t,i=e.prefixCls,a=i===void 0?"rc-input-number":i,u=e.className,h=e.style,s=e.min,g=e.max,w=e.step,f=w===void 0?1:w,v=e.defaultValue,E=e.value,k=e.disabled,c=e.readOnly,o=e.upHandler,I=e.downHandler,R=e.keyboard,S=e.controls,C=S===void 0?!0:S,D=e.stringMode,T=e.parser,_=e.formatter,M=e.precision,d=e.decimalSeparator,O=e.onChange,F=e.onInput,z=e.onPressEnter,$=e.onStep,Q=Nt(e,Jt),ue="".concat(a,"-input"),j=r.useRef(null),G=r.useState(!1),ce=ie(G,2),le=ce[0],se=ce[1],V=r.useRef(!1),L=r.useRef(!1),U=r.useRef(!1),de=r.useState(function(){return A(E??v)}),pe=ie(de,2),y=pe[0],me=pe[1];function ee(m){E===void 0&&me(m)}var X=r.useCallback(function(m,l){if(!l)return M>=0?M:Math.max(oe(m),oe(f))},[M,f]),Y=r.useCallback(function(m){var l=String(m);if(T)return T(l);var x=l;return d&&(x=x.replace(d,".")),x.replace(/[^\w.-]+/g,"")},[T,d]),te=r.useRef(""),fe=r.useCallback(function(m,l){if(_)return _(m,{userTyping:l,input:String(te.current)});var x=typeof m=="number"?ye(m):m;if(!l){var b=X(x,l);if(Fe(x)&&(d||b>=0)){var B=d||".";x=ge(x,B,b)}}return x},[_,X,d]),xe=r.useState(function(){var m=v??E;return y.isInvalidate()&&["string","number"].includes(Je(m))?Number.isNaN(m)?"":m:fe(y.toString(),!1)}),ne=ie(xe,2),q=ne[0],P=ne[1];te.current=q;function re(m,l){P(fe(m.isInvalidate()?m.toString(!1):m.toString(!l),l))}var Z=r.useMemo(function(){return Xe(g)},[g,M]),J=r.useMemo(function(){return Xe(s)},[s,M]),Ve=r.useMemo(function(){return!Z||!y||y.isInvalidate()?!1:Z.lessEquals(y)},[Z,y]),Me=r.useMemo(function(){return!J||!y||y.isInvalidate()?!1:y.lessEquals(J)},[J,y]),rt=Yt(j.current,le),$e=ie(rt,2),at=$e[0],it=$e[1],Ae=function(l){return Z&&!l.lessEquals(Z)?Z:J&&!J.lessEquals(l)?J:null},we=function(l){return!Ae(l)},Ne=function(l,x){var b=l,B=we(b)||b.isEmpty();if(!b.isEmpty()&&!x&&(b=Ae(b)||b,B=!0),!c&&!k&&B){var ae=b.toString(),Se=X(ae,x);return Se>=0&&(b=A(ge(ae,".",Se)),we(b)||(b=A(ge(ae,".",Se,!0)))),b.equals(y)||(ee(b),O==null||O(b.isEmpty()?null:Ge(D,b)),E===void 0&&re(b,x)),b}return y},ot=Zt(),Te=function m(l){if(at(),P(l),!L.current){var x=Y(l),b=A(x);b.isNaN()||Ne(b,!0)}F==null||F(l),ot(function(){var B=l;T||(B=l.replace(/。/g,".")),B!==l&&m(B)})},ut=function(){L.current=!0},ct=function(){L.current=!1,Te(j.current.value)},lt=function(l){Te(l.target.value)},Pe=function(l){var x;if(!(l&&Ve||!l&&Me)){V.current=!1;var b=A(U.current?Ke(f):f);l||(b=b.negate());var B=(y||A(0)).add(b.toString()),ae=Ne(B,!1);$==null||$(Ge(D,ae),{offset:U.current?Ke(f):f,type:l?"up":"down"}),(x=j.current)===null||x===void 0||x.focus()}},Be=function(l){var x=A(Y(q)),b=x;x.isNaN()?b=y:b=Ne(x,l),E!==void 0?re(y,!1):b.isNaN()||re(b,!1)},st=function(){V.current=!0},dt=function(l){var x=l.which,b=l.shiftKey;V.current=!0,b?U.current=!0:U.current=!1,x===ve.ENTER&&(L.current||(V.current=!1),Be(!1),z==null||z(l)),R!==!1&&!L.current&&[ve.UP,ve.DOWN].includes(x)&&(Pe(ve.UP===x),l.preventDefault())},pt=function(){V.current=!1,U.current=!1},mt=function(){Be(!1),se(!1),V.current=!1};return Ee(function(){y.isInvalidate()||re(y,!1)},[M]),Ee(function(){var m=A(E);me(m);var l=A(Y(q));(!m.equals(l)||!V.current||_)&&re(m,V.current)},[E]),Ee(function(){_&&it()},[q]),r.createElement("div",{className:H(a,u,(t={},N(t,"".concat(a,"-focused"),le),N(t,"".concat(a,"-disabled"),k),N(t,"".concat(a,"-readonly"),c),N(t,"".concat(a,"-not-a-number"),y.isNaN()),N(t,"".concat(a,"-out-of-range"),!y.isInvalidate()&&!we(y)),t)),style:h,onFocus:function(){se(!0)},onBlur:mt,onKeyDown:dt,onKeyUp:pt,onCompositionStart:ut,onCompositionEnd:ct,onBeforeInput:st},C&&r.createElement(Xt,{prefixCls:a,upNode:o,downNode:I,upDisabled:Ve,downDisabled:Me,onStep:Pe}),r.createElement("div",{className:"".concat(ue,"-wrap")},r.createElement("input",he({autoComplete:"off",role:"spinbutton","aria-valuemin":s,"aria-valuemax":g,"aria-valuenow":y.isInvalidate()?null:y.toString(),step:f},Q,{ref:St(j,n),className:ue,value:q,onChange:lt,disabled:k,readOnly:c}))))});nt.displayName="InputNumber";var Qt=function(e,n){var t={};for(var i in e)Object.prototype.hasOwnProperty.call(e,i)&&n.indexOf(i)<0&&(t[i]=e[i]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var a=0,i=Object.getOwnPropertySymbols(e);a<i.length;a++)n.indexOf(i[a])<0&&Object.prototype.propertyIsEnumerable.call(e,i[a])&&(t[i[a]]=e[i[a]]);return t},en=r.forwardRef(function(e,n){var t=r.useContext(Et),i=t.getPrefixCls,a=t.direction,u=r.useContext(It),h=r.useState(!1),s=ie(h,2),g=s[0],w=s[1],f=r.useRef(null);r.useImperativeHandle(n,function(){return f.current});var v=e.className,E=e.size,k=e.disabled,c=e.prefixCls,o=e.addonBefore,I=e.addonAfter,R=e.prefix,S=e.bordered,C=S===void 0?!0:S,D=e.readOnly,T=e.status,_=e.controls,M=Qt(e,["className","size","disabled","prefixCls","addonBefore","addonAfter","prefix","bordered","readOnly","status","controls"]),d=i("input-number",c),O=kt(d,a),F=O.compactSize,z=O.compactItemClassnames,$=r.createElement(Bt,{className:"".concat(d,"-handler-up-inner")}),Q=r.createElement(tt,{className:"".concat(d,"-handler-down-inner")}),ue=typeof _=="boolean"?_:void 0;Je(_)==="object"&&($=typeof _.upIcon>"u"?$:r.createElement("span",{className:"".concat(d,"-handler-up-inner")},_.upIcon),Q=typeof _.downIcon>"u"?Q:r.createElement("span",{className:"".concat(d,"-handler-down-inner")},_.downIcon));var j=r.useContext(Ct),G=j.hasFeedback,ce=j.status,le=j.isFormItemInput,se=j.feedbackIcon,V=zt(ce,T),L=F||E||u,U=r.useContext(_t),de=k??U,pe=H(N(N(N(N(N({},"".concat(d,"-lg"),L==="large"),"".concat(d,"-sm"),L==="small"),"".concat(d,"-rtl"),a==="rtl"),"".concat(d,"-borderless"),!C),"".concat(d,"-in-form-item"),le),ke(d,V),z,v),y=r.createElement(nt,he({ref:f,disabled:de,className:pe,upHandler:$,downHandler:Q,prefixCls:d,readOnly:D,controls:ue},M));if(R!=null||G){var me=H("".concat(d,"-affix-wrapper"),ke("".concat(d,"-affix-wrapper"),V,G),N(N(N(N(N(N(N(N({},"".concat(d,"-affix-wrapper-focused"),g),"".concat(d,"-affix-wrapper-disabled"),e.disabled),"".concat(d,"-affix-wrapper-sm"),u==="small"),"".concat(d,"-affix-wrapper-lg"),u==="large"),"".concat(d,"-affix-wrapper-rtl"),a==="rtl"),"".concat(d,"-affix-wrapper-readonly"),D),"".concat(d,"-affix-wrapper-borderless"),!C),"".concat(v),!(o||I)&&v));y=r.createElement("div",{className:me,style:e.style,onMouseUp:function(){return f.current.focus()}},R&&r.createElement("span",{className:"".concat(d,"-prefix")},R),qe(y,{style:null,value:e.value,onFocus:function(q){var P;w(!0),(P=e.onFocus)===null||P===void 0||P.call(e,q)},onBlur:function(q){var P;w(!1),(P=e.onBlur)===null||P===void 0||P.call(e,q)}}),G&&r.createElement("span",{className:"".concat(d,"-suffix")},se))}if(o!=null||I!=null){var ee="".concat(d,"-group"),X="".concat(ee,"-addon"),Y=o?r.createElement("div",{className:X},o):null,te=I?r.createElement("div",{className:X},I):null,fe=H("".concat(d,"-wrapper"),ee,N({},"".concat(ee,"-rtl"),a==="rtl")),xe=H("".concat(d,"-group-wrapper"),N(N(N({},"".concat(d,"-group-wrapper-sm"),u==="small"),"".concat(d,"-group-wrapper-lg"),u==="large"),"".concat(d,"-group-wrapper-rtl"),a==="rtl"),ke("".concat(d,"-group-wrapper"),V,G),v);y=r.createElement("div",{className:xe,style:e.style},r.createElement("div",{className:fe},Y&&r.createElement(Le,null,r.createElement(Ue,{status:!0,override:!0},Y)),qe(y,{style:null,disabled:de}),te&&r.createElement(Le,null,r.createElement(Ue,{status:!0,override:!0},te))))}return y}),tn=`.phone-input-item-container {
  position: relative;
  display: block;
  width: 100%;
  height: auto;
  overflow: initial;
}
.phone-input-item-container .ant-input-affix-wrapper,
.phone-input-item-container .ant-input-number-group-wrapper {
  width: 100%;
  padding: 0;
  border: 1px solid var(--input-border-color) !important;
  border-radius: var(--primary-btn-border-radius);
  line-height: 47px;
  background: var(--input-background-color) !important;
  box-shadow: none !important;
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-group-addon,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-group-addon {
  position: initial;
  border: none;
  background-color: var(--input-background-color);
  border-end-start-radius: var(--primary-btn-border-radius);
  border-start-start-radius: var(--primary-btn-border-radius);
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-status-error:not(.ant-input-number-disabled, .ant-input-number-borderless).ant-input-number,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-status-error:not(.ant-input-number-disabled, .ant-input-number-borderless).ant-input-number,
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-status-error:not(
        .ant-input-number-disabled,
        .ant-input-number-borderless
      ).ant-input-number:hover,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-status-error:not(
        .ant-input-number-disabled,
        .ant-input-number-borderless
      ).ant-input-number:hover {
  border: none;
  background: none;
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number {
  border: none;
  background: none;
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-focused,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-focused {
  box-shadow: none !important;
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-disabled,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-disabled {
  background: none;
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input,
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-input,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-input {
  height: 47px;
  border: none !important;
  border-radius: 0;
  line-height: 47px;
  color: var(--text-color);
}
.phone-input-item-container .ant-input-affix-wrapper .ant-input:hover,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input:hover,
.phone-input-item-container .ant-input-affix-wrapper .ant-input-number-input:hover,
.phone-input-item-container .ant-input-number-group-wrapper .ant-input-number-input:hover {
  border: none !important;
}
.phone-input-item-container .ant-input-affix-wrapper[data-focus='true'],
.phone-input-item-container .ant-input-number-group-wrapper[data-focus='true'] {
  border: 1px solid var(--accent-color) !important;
}
.phone-input-item-container .ant-input[disabled] {
  width: 100%;
  height: 47px;
  border: 1px solid var(--input-border-color);
  border-radius: var(--primary-btn-border-radius);
  color: var(--text-color);
  background-color: var(--input-background-color);
}
.phone-input-item-container .country-box {
  position: initial;
  cursor: pointer;
}
.phone-input-item-container .country-box .prefix-wrap {
  display: flex;
  color: var(--text-color);
  gap: 4px;
}
.phone-input-item-container .country-box .account-select-country-list {
  position: absolute;
  z-index: 2;
  top: 54px;
  left: 0%;
  width: 100%;
  height: 350px;
  border-radius: var(--card-border-radius) !important;
  overflow: hidden auto;
  background-color: var(--input-background-color);
}
.phone-input-item-container .country-box .account-select-country-list::-webkit-scrollbar {
  display: none;
  width: 0;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .ant-input:focus {
  border: none !important;
  box-shadow: none !important;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap.account-select-country-item {
  padding-right: 13px;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap.account-select-country-item:hover {
  background: var(--input-background-color);
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap.account-select-country-item:hover.search-input-wrap {
  background: none;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .ant-input-clear-icon {
  color: var(--text-color);
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .ant-input-affix-wrapper {
  border-color: var(--keyword-border-color) !important;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .ant-input-suffix {
  position: relative;
  right: 10px;
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .search-input {
  width: 100%;
  height: 32px;
  border-radius: var(--primary-btn-border-radius);
  overflow: hidden;
  color: var(--text-color);
  background-color: var(--input-background-color);
}
.phone-input-item-container .country-box .account-select-country-list .search-input-wrap .search-input .ant-input {
  width: 100%;
  height: auto;
  padding-top: 4px;
  padding-bottom: 4px;
  line-height: initial;
}
.phone-input-item-container .country-box .account-select-country-list .no-data {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 160px;
  color: var(--text-color);
}
.phone-input-item-container .country-box .account-select-country-list .account-select-country-item {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  height: 47px;
  padding: 5px 0 5px 13px;
  margin: 0;
  border-bottom: 1px solid var(--keyword-border-color);
  font-size: 14px;
  color: var(--text-color);
  cursor: pointer;
}
.phone-input-item-container .country-box .account-select-country-list .account-select-country-item:hover {
  background-color: var(--keyword-border-color);
}
.phone-input-item-container .country-box .account-select-country-list .account-select-country-item div {
  display: flex;
  max-width: 80%;
  margin-right: 13px;
}
.phone-input-item-container .country-box input[type='number']::-webkit-inner-spin-button,
.phone-input-item-container .country-box input[type='number']::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.phone-input-item-container .country-box.phone {
  display: flex;
  align-items: center;
}
.phone-input-item-container .country-box .account-select-opt {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  width: 40px;
  height: 100%;
  padding-right: 4px;
  padding-left: 4px;
  cursor: pointer;
}
.phone-input-item-container .country-box .account-select-opt .account-select-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  font-size: 15px;
}
.phone-input-item-container .country-box .account-select-opt .down-more {
  margin-left: 6px;
  font-size: 10px;
}
.phone-input-item-container .country-box span {
  flex-shrink: 0;
  margin: 0;
  font-size: 15px;
}
.phone-input-item-container .country-box .country-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.phone-input-item-container .country-box input {
  flex-shrink: 1;
  box-sizing: border-box;
  width: 100%;
  height: 45px;
  padding: 0 15px;
  border: none;
  outline: none;
  font-weight: 400;
  font-size: 15px;
  line-height: 45px;
  color: var(--text-color);
  background-color: transparent;
}
`,nn=e=>{let n=e.form,t=W.useWatch(e.name,n),[i,a]=r.useState(["United States","us","1"]),{t:u}=Qe(),[h,s]=r.useState(!1),g=r.useRef(),w=r.useRef(),[f,v]=r.useState(""),E=r.useRef(),k=r.useMemo(()=>Oe.filter(c=>c.join("+").toLowerCase().includes(f.toLowerCase())),[f]);return Ut(()=>{s(!1)},g),r.useEffect(()=>{h&&v("")},[h]),r.useEffect(()=>{if(t!=null&&t.includes("*"))return;let c=`+${i[2]}`,o=(t||"").replace(/^\+\d+/,"").trim();n.setFieldsValue({[e.name]:`${c} ${o}`}),o&&n.validateFields(["_phone"])},[i,t]),r.useEffect(()=>{var c;try{if((c=t==null?void 0:t.includes)!=null&&c.call(t,"*"))n.setFieldsValue({_phone:t});else if(t){if(He(t)){let o=et(t),I=o.nationalNumber;n.setFieldsValue({_phone:I});let R=o.countryCallingCode.toString(),S=o.country;if(R&&S){let C=Oe.filter(D=>D[2].toString()===R&&D[1].toLowerCase()===S.toLowerCase());C&&C.length>0&&a(C[C.length-1])}}}else{let o=ft();o&&a(o)}}catch{}},[t]),p.createElement(p.Fragment,null,p.createElement("style",null,tn),p.createElement("div",{className:"phone-input-item-container"},p.createElement(W.Item,{className:!e.disabled||e.disabled&&e.previewMode!=="input"?"hidden":"",extra:e.extra,name:e.name},p.createElement(Ce,{disabled:e.disabled})),p.createElement(W.Item,{name:"_phone",className:e.disabled&&e.previewMode=="input"?"hidden":"",extra:e.extra,rules:[{required:!0,validator:(c,o)=>{try{if(o)try{if(o=`+${i[2]} ${o}`,!He(o))return Promise.reject(u("login.phone_format_error"))}catch{return Promise.reject(u("login.phone_format_error"))}else return Promise.reject(u("login.input_phone_holder"))}catch{return Promise.reject(u("login.phone_format_error"))}return Promise.resolve()}}]},p.createElement(en,{placeholder:u("account.mobile"),disabled:e.disabled,controls:!1,onChange:c=>{n.setFieldsValue({[e.name]:`+${i[2]} ${c}`})},onFocus:()=>{var c;(c=document.querySelector(".ant-input-number-group-wrapper"))==null||c.setAttribute("data-focus","true")},onBlur:()=>{var c;(c=document.querySelector(".ant-input-number-group-wrapper"))==null||c.setAttribute("data-focus","false")},addonBefore:p.createElement("div",{className:"country-box phone",ref:w},p.createElement("div",{className:"prefix-wrap",onClick:()=>{e.disabled||(s(!h),setTimeout(()=>{var c;(c=E.current)==null||c.focus()}))},ref:g},p.createElement("div",{className:"account-select-opt"},p.createElement("div",{className:"account-select-icon"},We(`${i[1]}`)),p.createElement(tt,{className:"down-more"})),p.createElement("span",null,"+",i[2])),h&&p.createElement("div",{className:"account-select-country-list "},p.createElement("div",{className:"account-select-country-item search-input-wrap",onClick:c=>{c.stopPropagation()}},p.createElement(Ce,{ref:E,className:"search-input",type:"text",placeholder:u("login.search_country_holder"),allowClear:!0,onChange:c=>{var o;let I=((o=c==null?void 0:c.target)==null?void 0:o.value)||"";v(I)}})),k&&k.length?p.createElement("div",{className:"p-country-list"},k.map((c,o)=>p.createElement("div",{key:`${c[0]}-${c[1]}-${c[2]}`,className:"account-select-country-item",onClick:()=>{a(c),s(!1)}},p.createElement("div",{className:"country-box"},p.createElement("div",{className:"country-flag"},We(`${c[1]}`)),p.createElement("span",{className:"country-name"},c[0])),p.createElement("div",{className:"country-code"},"+"+c[2])))):p.createElement("div",{className:"no-data"},"No data")))}))))},rn=nn,an=`.login-account-bind {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}
.login-account-bind .ant-input-status-error:not(.ant-input-disabled, .ant-input-borderless).ant-input {
  background-color: var(--input-background-color);
}
.login-account-bind .ant-spin-spinning {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  padding-bottom: 20vh;
}
.login-account-bind .account-title {
  font-weight: 500;
  font-size: 18px;
}
.login-account-bind .account-bind-form {
  width: 100%;
  padding: 0 18px;
  margin-top: 34px;
}
.login-account-bind .account-bind-form .account-input {
  width: 100%;
  height: 47px;
  border: 1px solid var(--input-border-color);
  border-radius: var(--primary-btn-border-radius);
  color: var(--text-color);
  background-color: var(--input-background-color);
}
.login-account-bind .account-bind-form .link-account-hint {
  align-self: flex-start;
  padding-top: 6px;
  font-size: 12px;
  color: var(--secondary-text-color);
}
.login-account-bind .account-bind-form .link-btn {
  margin-top: 15px;
  margin-bottom: 30px;
}
.login-account-bind .account-bind-form .unlink-btn {
  margin-top: 15px;
  margin-bottom: 30px;
  color: #fff;
  background: #ea4335;
}
.login-account-bind .footer-box {
  position: absolute;
  bottom: 10px;
  margin: 0;
}
@media screen and (max-height: 350px) {
  .login-account-bind .footer-box {
    position: unset;
    bottom: 0;
    margin-bottom: 10px;
  }
}
`,on=e=>{let n=e,t=(n==null?void 0:n.authType)||"",i=(n==null?void 0:n.verifyToken)||"",{t:a}=Qe(),[u]=W.useForm(),h=Rt(),s=Dt(),{userInfo:g}=Ft(),{showSelectSecurityAccount:w}=Vt(),[f,v]=r.useState(!1),{runAsync:E}=Pt(Tt,{manual:!0}),{authCoreModal:k}=Mt(),c=r.useMemo(()=>vt({userInfo:g,t:a}),[g,a]),o=r.useMemo(()=>{var S;return((S=c==null?void 0:c.find)==null?void 0:S.call(c,C=>C.type===t))||{}},[c,t]),I=r.useMemo(()=>!o.value&&!o.id,[o]);r.useMemo(()=>!o.isOriginal&&!I,[o]);let R=()=>{u.validateFields().then(S=>{var C,D,T,_,M,d,O;let F=((_=(T=(D=(C=u.getFieldsValue())==null?void 0:C.inputValue)==null?void 0:D.replace(/\s/g,""))==null?void 0:T.trim)==null?void 0:_.call(T))||"";if(v(!0),t==="phone"&&((M=g==null?void 0:g.security_account)==null?void 0:M.phone)===F){Ie.error({title:a("new.duplicate_phonel_bindings"),wrapClassName:"auth-core-modal-error",getContainer:()=>k.rootBody}),v(!1);return}else if(t==="email"&&((O=(d=g==null?void 0:g.security_account)==null?void 0:d.email)==null?void 0:O.toLowerCase())===(F==null?void 0:F.toLowerCase())){Ie.error({title:a("new.duplicate_email_bindings"),wrapClassName:"auth-core-modal-error",getContainer:()=>k.rootBody}),v(!1);return}let z={};t===be.phone?z.phone=F:z.email=F,E(z).then($=>{h("/account/verify",{state:{account:F,authType:t,verifyToken:i,pageType:"bind_login_account"}}),v(!1)}).catch($=>{v(!1),$.error_code===20109?Ie.error({title:t===be.phone?a("error.server_phone_20109"):a("error.server_email_20109"),wrapClassName:"auth-core-modal-error",getContainer:()=>k.rootBody}):s.error($.message)})})};return bt(S=>{h("/account/verify",{state:{account:S.account,authType:t,unbindAccount:u.getFieldValue("inputValue"),pageType:"unbind_login_account"}})},{wait:3e3}),r.useEffect(()=>{if(o!=null&&o.value||o!=null&&o.id)if(t===be.phone){let S=et(o==null?void 0:o.value.replace(/\s/g,"")),C=S.countryCallingCode,D=S.nationalNumber;u.setFieldsValue({inputValue:ze(`+${C} ${D}`)})}else u.setFieldsValue({inputValue:ze((o==null?void 0:o.value)||(o==null?void 0:o.id)||"")})},[o==null?void 0:o.value,o==null?void 0:o.id,t]),p.createElement("div",{className:"login-account-bind "},p.createElement("style",null,an),p.createElement(gt,{displayBackBtn:!0},o.name),p.createElement(W,{className:"account-bind-form",layout:"vertical",form:u,onFinish:R},t===be.phone?p.createElement(rn,{name:"inputValue",form:u,disabled:!I,previewMode:"input",extra:p.createElement("div",{className:"link-account-hint"},a("new.link_account_hint").format(o.name))}):p.createElement(W.Item,{name:"inputValue",validateTrigger:"onBlur",extra:p.createElement("div",{className:"link-account-hint"},a("new.link_account_hint").format(o.name)),rules:[{required:!0,validator:async(S,C)=>{if(C){if(!$t.test(C))return Promise.reject(a("login.email_format_error"))}else return Promise.reject(a("account.input_vaild_email"));return Promise.resolve()}}]},p.createElement(Ce,{className:"account-input",placeholder:o.name,disabled:!I,onChange:S=>u.setFields([{name:"email",value:S.target.value,errors:[]}])})),p.createElement(W.Item,null,I?p.createElement(At,{className:"primary-antd-btn link-btn",loading:f,htmlType:"submit"},a("account.link")):p.createElement(p.Fragment,null))),p.createElement(ht,null))},wn=on;export{wn as default};
