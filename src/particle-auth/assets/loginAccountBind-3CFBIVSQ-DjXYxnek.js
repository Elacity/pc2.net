import{r as We,t as wt}from"./chunk-UD6Q2AOH-DsQGa4dk.js";import{j as St,u as Nt,F as ze}from"./loginAccount-26B5XW5Y-KFqkOnmA.js";import{C as Et}from"./chunk-PHADJY2T-CmPoQ4kq.js";import{p as $t}from"./chunk-TT34D6R6-L6WQbq6J.js";import{dg as Je,dh as Qe,cT as _,r as i,di as It,cP as ie,dj as Ct,dk as pe,cS as z,bK as me,cW as Ze,cQ as Rt,dl as Ee,dm as kt,dn as _t,c_ as Ot,c$ as Dt,dp as Bt,d1 as $e,dq as A,dr as Ft,d3 as Mt,d4 as At,ds as Vt,dt as jt,du as Tt,dv as Pt,dw as Le,dc as Wt,dx as ke,cc as zt,dy as Lt,$ as et,aw as Gt,an as Ht,ax as qt,Y as Ut,ap as Kt,a4 as h,a0 as ce,ar as tt,a5 as nt,a2 as Xt,ao as Yt,aG as Ie,aq as Ge,dz as Jt}from"./index-Da1B_bQX.js";import{u as Qt}from"./useRequest-BKPiX46F.js";import{F as q,I as Ce}from"./index-UeCXYwO8.js";import{R as rt}from"./DownOutlined-Bg96VDSs.js";import{R as Zt}from"./UpOutlined-S3neloA-.js";import{B as en,t as tn,i as nn,a as rn,g as at,b as an,c as on,d as un,e as ln,f as sn,h as cn,j as dn,k as pn,u as mn,l as He,m as fn}from"./TextArea-BwUU35Ve.js";import{i as gn}from"./colors-_j0kgzHJ.js";import{g as qe}from"./unicode-D4lwPBzr.js";import"./chunk-YNAB6HVU-CEwbjBrt.js";import"./throttle-CV9_TlMb.js";import"./index-DWJUcTgy.js";function Re(){return typeof BigInt=="function"}function it(e){return!e&&e!==0&&!Number.isNaN(e)||!String(e).trim()}function K(e){var t=e.trim(),n=t.startsWith("-");n&&(t=t.slice(1)),t=t.replace(/(\.\d*[^0])0*$/,"$1").replace(/\.0*$/,"").replace(/^0+/,""),t.startsWith(".")&&(t="0".concat(t));var r=t||"0",a=r.split("."),o=a[0]||"0",g=a[1]||"0";o==="0"&&g==="0"&&(n=!1);var c=n?"-":"";return{negative:n,negativeStr:c,trimStr:r,integerStr:o,decimalStr:g,fullStr:"".concat(c).concat(r)}}function _e(e){var t=String(e);return!Number.isNaN(Number(t))&&t.includes("e")}function U(e){var t=String(e);if(_e(e)){var n=Number(t.slice(t.indexOf("e-")+2)),r=t.match(/\.(\d+)/);return r!=null&&r[1]&&(n+=r[1].length),n}return t.includes(".")&&Oe(t)?t.length-t.indexOf(".")-1:0}function fe(e){var t=String(e);if(_e(e)){if(e>Number.MAX_SAFE_INTEGER)return String(Re()?BigInt(e).toString():Number.MAX_SAFE_INTEGER);if(e<Number.MIN_SAFE_INTEGER)return String(Re()?BigInt(e).toString():Number.MIN_SAFE_INTEGER);t=e.toFixed(U(t))}return K(t).fullStr}function Oe(e){return typeof e=="number"?!Number.isNaN(e):e?/^\s*-?\d+(\.\d+)?\s*$/.test(e)||/^\s*-?\d+\.\s*$/.test(e)||/^\s*-?\.\d+\s*$/.test(e):!1}var hn=(function(){function e(t){if(Qe(this,e),_(this,"origin",""),_(this,"negative",void 0),_(this,"integer",void 0),_(this,"decimal",void 0),_(this,"decimalLen",void 0),_(this,"empty",void 0),_(this,"nan",void 0),it(t)){this.empty=!0;return}if(this.origin=String(t),t==="-"||Number.isNaN(t)){this.nan=!0;return}var n=t;if(_e(n)&&(n=Number(n)),n=typeof n=="string"?n:fe(n),Oe(n)){var r=K(n);this.negative=r.negative;var a=r.trimStr.split(".");this.integer=BigInt(a[0]);var o=a[1]||"0";this.decimal=BigInt(o),this.decimalLen=o.length}else this.nan=!0}return Je(e,[{key:"getMark",value:function(){return this.negative?"-":""}},{key:"getIntegerStr",value:function(){return this.integer.toString()}},{key:"getDecimalStr",value:function(){return this.decimal.toString().padStart(this.decimalLen,"0")}},{key:"alignDecimal",value:function(n){var r="".concat(this.getMark()).concat(this.getIntegerStr()).concat(this.getDecimalStr().padEnd(n,"0"));return BigInt(r)}},{key:"negate",value:function(){var n=new e(this.toString());return n.negative=!n.negative,n}},{key:"cal",value:function(n,r,a){var o=Math.max(this.getDecimalStr().length,n.getDecimalStr().length),g=this.alignDecimal(o),c=n.alignDecimal(o),m=r(g,c).toString(),v=a(o),d=K(m),y=d.negativeStr,E=d.trimStr,w="".concat(y).concat(E.padStart(v+1,"0"));return new e("".concat(w.slice(0,-v),".").concat(w.slice(-v)))}},{key:"add",value:function(n){if(this.isInvalidate())return new e(n);var r=new e(n);return r.isInvalidate()?this:this.cal(r,function(a,o){return a+o},function(a){return a})}},{key:"multi",value:function(n){var r=new e(n);return this.isInvalidate()||r.isInvalidate()?new e(NaN):this.cal(r,function(a,o){return a*o},function(a){return a*2})}},{key:"isEmpty",value:function(){return this.empty}},{key:"isNaN",value:function(){return this.nan}},{key:"isInvalidate",value:function(){return this.isEmpty()||this.isNaN()}},{key:"equals",value:function(n){return this.toString()===(n==null?void 0:n.toString())}},{key:"lessEquals",value:function(n){return this.add(n.negate().toString()).toNumber()<=0}},{key:"toNumber",value:function(){return this.isNaN()?NaN:Number(this.toString())}},{key:"toString",value:function(){var n=arguments.length>0&&arguments[0]!==void 0?arguments[0]:!0;return n?this.isInvalidate()?"":K("".concat(this.getMark()).concat(this.getIntegerStr(),".").concat(this.getDecimalStr())).fullStr:this.origin}}]),e})(),bn=(function(){function e(t){if(Qe(this,e),_(this,"origin",""),_(this,"number",void 0),_(this,"empty",void 0),it(t)){this.empty=!0;return}this.origin=String(t),this.number=Number(t)}return Je(e,[{key:"negate",value:function(){return new e(-this.toNumber())}},{key:"add",value:function(n){if(this.isInvalidate())return new e(n);var r=Number(n);if(Number.isNaN(r))return this;var a=this.number+r;if(a>Number.MAX_SAFE_INTEGER)return new e(Number.MAX_SAFE_INTEGER);if(a<Number.MIN_SAFE_INTEGER)return new e(Number.MIN_SAFE_INTEGER);var o=Math.max(U(this.number),U(r));return new e(a.toFixed(o))}},{key:"multi",value:function(n){var r=Number(n);if(this.isInvalidate()||Number.isNaN(r))return new e(NaN);var a=this.number*r;if(a>Number.MAX_SAFE_INTEGER)return new e(Number.MAX_SAFE_INTEGER);if(a<Number.MIN_SAFE_INTEGER)return new e(Number.MIN_SAFE_INTEGER);var o=Math.max(U(this.number),U(r));return new e(a.toFixed(o))}},{key:"isEmpty",value:function(){return this.empty}},{key:"isNaN",value:function(){return Number.isNaN(this.number)}},{key:"isInvalidate",value:function(){return this.isEmpty()||this.isNaN()}},{key:"equals",value:function(n){return this.toNumber()===(n==null?void 0:n.toNumber())}},{key:"lessEquals",value:function(n){return this.add(n.negate().toString()).toNumber()<=0}},{key:"toNumber",value:function(){return this.number}},{key:"toString",value:function(){var n=arguments.length>0&&arguments[0]!==void 0?arguments[0]:!0;return n?this.isInvalidate()?"":fe(this.number):this.origin}}]),e})();function j(e){return Re()?new hn(e):new bn(e)}function de(e,t,n){var r=arguments.length>3&&arguments[3]!==void 0?arguments[3]:!1;if(e==="")return"";var a=K(e),o=a.negativeStr,g=a.integerStr,c=a.decimalStr,m="".concat(t).concat(c),v="".concat(o).concat(g);if(n>=0){var d=Number(c[n]);if(d>=5&&!r){var y=j(e).add("".concat(o,"0.").concat("0".repeat(n)).concat(10-d));return de(y.toString(),t,n,r)}return n===0?v:"".concat(v).concat(t).concat(c.padEnd(n,"0").slice(0,n))}return m===".0"?v:"".concat(v).concat(m)}function vn(e,t){return typeof Proxy<"u"&&e?new Proxy(e,{get:function(r,a){if(t[a])return t[a];var o=r[a];return typeof o=="function"?o.bind(r):o}}):e}function yn(e,t){var n=i.useRef(null);function r(){try{var o=e.selectionStart,g=e.selectionEnd,c=e.value,m=c.substring(0,o),v=c.substring(g);n.current={start:o,end:g,value:c,beforeTxt:m,afterTxt:v}}catch{}}function a(){if(e&&n.current&&t)try{var o=e.value,g=n.current,c=g.beforeTxt,m=g.afterTxt,v=g.start,d=o.length;if(o.startsWith(c))d=c.length;else if(o.endsWith(m))d=o.length-n.current.afterTxt.length;else{var y=c[v-1],E=o.indexOf(y,v-1);E!==-1&&(d=E+1)}e.setSelectionRange(d,d)}catch(w){It(!1,"Something warning of cursor restore. Please fire issue about this: ".concat(w.message))}}return[r,a]}var xn=function(){var t=i.useState(!1),n=ie(t,2),r=n[0],a=n[1];return Ct(function(){a(gn())},[]),r},wn=200,Sn=600;function Nn(e){var t=e.prefixCls,n=e.upNode,r=e.downNode,a=e.upDisabled,o=e.downDisabled,g=e.onStep,c=i.useRef(),m=i.useRef([]),v=i.useRef();v.current=g;var d=function(){clearTimeout(c.current)},y=function(S,p){S.preventDefault(),d(),v.current(p);function O(){v.current(p),c.current=setTimeout(O,wn)}c.current=setTimeout(O,Sn)};i.useEffect(function(){return function(){d(),m.current.forEach(function(x){return pe.cancel(x)})}},[]);var E=xn();if(E)return null;var w="".concat(t,"-handler"),l=z(w,"".concat(w,"-up"),_({},"".concat(w,"-up-disabled"),a)),u=z(w,"".concat(w,"-down"),_({},"".concat(w,"-down-disabled"),o)),I=function(){return m.current.push(pe(d))},C={unselectable:"on",role:"button",onMouseUp:I,onMouseLeave:I};return i.createElement("div",{className:"".concat(w,"-wrap")},i.createElement("span",me({},C,{onMouseDown:function(S){y(S,!0)},"aria-label":"Increase Value","aria-disabled":a,className:l}),n||i.createElement("span",{unselectable:"on",className:"".concat(t,"-handler-up-inner")})),i.createElement("span",me({},C,{onMouseDown:function(S){y(S,!1)},"aria-label":"Decrease Value","aria-disabled":o,className:u}),r||i.createElement("span",{unselectable:"on",className:"".concat(t,"-handler-down-inner")})))}function Ue(e){var t=typeof e=="number"?fe(e):K(e).fullStr,n=t.includes(".");return n?K(t.replace(/(\d)\.(\d)/g,"$1$2.")).fullStr:e+"0"}const En=(function(){var e=i.useRef(0),t=function(){pe.cancel(e.current)};return i.useEffect(function(){return t},[]),function(n){t(),e.current=pe(function(){n()})}});var $n=["prefixCls","className","style","min","max","step","defaultValue","value","disabled","readOnly","upHandler","downHandler","keyboard","changeOnWheel","controls","classNames","stringMode","parser","formatter","precision","decimalSeparator","onChange","onInput","onPressEnter","onStep","changeOnBlur","domRef"],In=["disabled","style","prefixCls","value","prefix","suffix","addonBefore","addonAfter","className","classNames"],Ke=function(t,n){return t||n.isEmpty()?n.toString():n.toNumber()},Xe=function(t){var n=j(t);return n.isInvalidate()?null:n},Cn=i.forwardRef(function(e,t){var n=e.prefixCls,r=e.className,a=e.style,o=e.min,g=e.max,c=e.step,m=c===void 0?1:c,v=e.defaultValue,d=e.value,y=e.disabled,E=e.readOnly,w=e.upHandler,l=e.downHandler,u=e.keyboard,I=e.changeOnWheel,C=I===void 0?!1:I,x=e.controls,S=x===void 0?!0:x;e.classNames;var p=e.stringMode,O=e.parser,B=e.formatter,R=e.precision,D=e.decimalSeparator,T=e.onChange,k=e.onInput,F=e.onPressEnter,M=e.onStep,W=e.changeOnBlur,ee=W===void 0?!0:W,ge=e.domRef,he=Ze(e,$n),oe="".concat(n,"-input"),L=i.useRef(null),G=i.useState(!1),ue=ie(G,2),X=ue[0],te=ue[1],V=i.useRef(!1),H=i.useRef(!1),Y=i.useRef(!1),be=i.useState(function(){return j(d??v)}),le=ie(be,2),$=le[0],J=le[1];function lt(f){d===void 0&&J(f)}var ve=i.useCallback(function(f,s){if(!s)return R>=0?R:Math.max(U(f),U(m))},[R,m]),ye=i.useCallback(function(f){var s=String(f);if(O)return O(s);var N=s;return D&&(N=N.replace(D,".")),N.replace(/[^\w.-]+/g,"")},[O,D]),xe=i.useRef(""),De=i.useCallback(function(f,s){if(B)return B(f,{userTyping:s,input:String(xe.current)});var N=typeof f=="number"?fe(f):f;if(!s){var b=ve(N,s);if(Oe(N)&&(D||b>=0)){var P=D||".";N=de(N,P,b)}}return N},[B,ve,D]),st=i.useState(function(){var f=v??d;return $.isInvalidate()&&["string","number"].includes(Rt(f))?Number.isNaN(f)?"":f:De($.toString(),!1)}),Be=ie(st,2),ne=Be[0],Fe=Be[1];xe.current=ne;function re(f,s){Fe(De(f.isInvalidate()?f.toString(!1):f.toString(!s),s))}var Q=i.useMemo(function(){return Xe(g)},[g,R]),Z=i.useMemo(function(){return Xe(o)},[o,R]),Me=i.useMemo(function(){return!Q||!$||$.isInvalidate()?!1:Q.lessEquals($)},[Q,$]),Ae=i.useMemo(function(){return!Z||!$||$.isInvalidate()?!1:$.lessEquals(Z)},[Z,$]),ct=yn(L.current,X),Ve=ie(ct,2),dt=Ve[0],pt=Ve[1],je=function(s){return Q&&!s.lessEquals(Q)?Q:Z&&!Z.lessEquals(s)?Z:null},we=function(s){return!je(s)},se=function(s,N){var b=s,P=we(b)||b.isEmpty();if(!b.isEmpty()&&!N&&(b=je(b)||b,P=!0),!E&&!y&&P){var ae=b.toString(),Ne=ve(ae,N);return Ne>=0&&(b=j(de(ae,".",Ne)),we(b)||(b=j(de(ae,".",Ne,!0)))),b.equals($)||(lt(b),T==null||T(b.isEmpty()?null:Ke(p,b)),d===void 0&&re(b,N)),b}return $},mt=En(),Te=function f(s){if(dt(),xe.current=s,Fe(s),!H.current){var N=ye(s),b=j(N);b.isNaN()||se(b,!0)}k==null||k(s),mt(function(){var P=s;O||(P=s.replace(/。/g,".")),P!==s&&f(P)})},ft=function(){H.current=!0},gt=function(){H.current=!1,Te(L.current.value)},ht=function(s){Te(s.target.value)},Se=function(s){var N;if(!(s&&Me||!s&&Ae)){V.current=!1;var b=j(Y.current?Ue(m):m);s||(b=b.negate());var P=($||j(0)).add(b.toString()),ae=se(P,!1);M==null||M(Ke(p,ae),{offset:Y.current?Ue(m):m,type:s?"up":"down"}),(N=L.current)===null||N===void 0||N.focus()}},Pe=function(s){var N=j(ye(ne)),b;N.isNaN()?b=se($,s):b=se(N,s),d!==void 0?re($,!1):b.isNaN()||re(b,!1)},bt=function(){V.current=!0},vt=function(s){var N=s.key,b=s.shiftKey;V.current=!0,Y.current=b,N==="Enter"&&(H.current||(V.current=!1),Pe(!1),F==null||F(s)),u!==!1&&!H.current&&["Up","ArrowUp","Down","ArrowDown"].includes(N)&&(Se(N==="Up"||N==="ArrowUp"),s.preventDefault())},yt=function(){V.current=!1,Y.current=!1};i.useEffect(function(){if(C&&X){var f=function(b){Se(b.deltaY<0),b.preventDefault()},s=L.current;if(s)return s.addEventListener("wheel",f,{passive:!1}),function(){return s.removeEventListener("wheel",f)}}});var xt=function(){ee&&Pe(!1),te(!1),V.current=!1};return Ee(function(){$.isInvalidate()||re($,!1)},[R,B]),Ee(function(){var f=j(d);J(f);var s=j(ye(ne));(!f.equals(s)||!V.current||B)&&re(f,V.current)},[d]),Ee(function(){B&&pt()},[ne]),i.createElement("div",{ref:ge,className:z(n,r,_(_(_(_(_({},"".concat(n,"-focused"),X),"".concat(n,"-disabled"),y),"".concat(n,"-readonly"),E),"".concat(n,"-not-a-number"),$.isNaN()),"".concat(n,"-out-of-range"),!$.isInvalidate()&&!we($))),style:a,onFocus:function(){te(!0)},onBlur:xt,onKeyDown:vt,onKeyUp:yt,onCompositionStart:ft,onCompositionEnd:gt,onBeforeInput:bt},S&&i.createElement(Nn,{prefixCls:n,upNode:w,downNode:l,upDisabled:Me,downDisabled:Ae,onStep:Se}),i.createElement("div",{className:"".concat(oe,"-wrap")},i.createElement("input",me({autoComplete:"off",role:"spinbutton","aria-valuemin":o,"aria-valuemax":g,"aria-valuenow":$.isInvalidate()?null:$.toString(),step:m},he,{ref:kt(L,t),className:oe,value:ne,onChange:ht,disabled:y,readOnly:E}))))}),Rn=i.forwardRef(function(e,t){var n=e.disabled,r=e.style,a=e.prefixCls,o=a===void 0?"rc-input-number":a,g=e.value,c=e.prefix,m=e.suffix,v=e.addonBefore,d=e.addonAfter,y=e.className,E=e.classNames,w=Ze(e,In),l=i.useRef(null),u=i.useRef(null),I=i.useRef(null),C=function(S){I.current&&tn(I.current,S)};return i.useImperativeHandle(t,function(){return vn(I.current,{focus:C,nativeElement:l.current.nativeElement||u.current})}),i.createElement(en,{className:y,triggerFocus:C,prefixCls:o,value:g,disabled:n,style:r,prefix:c,suffix:m,addonAfter:d,addonBefore:v,classNames:E,components:{affixWrapper:"div",groupWrapper:"div",wrapper:"div",groupAddon:"div"},ref:l},i.createElement(Cn,me({prefixCls:o,disabled:n,ref:I,domRef:u,className:E==null?void 0:E.input},w)))});const kn=e=>{var t;const n=(t=e.handleVisible)!==null&&t!==void 0?t:"auto",r=e.controlHeightSM-e.lineWidth*2;return Object.assign(Object.assign({},nn(e)),{controlWidth:90,handleWidth:r,handleFontSize:e.fontSize/2,handleVisible:n,handleActiveBg:e.colorFillAlter,handleBg:e.colorBgContainer,filledHandleBg:new _t(e.colorFillSecondary).onBackground(e.colorBgContainer).toHexString(),handleHoverColor:e.colorPrimary,handleBorderColor:e.colorBorder,handleOpacity:n===!0?1:0,handleVisibleWidth:n===!0?r:0})},Ye=({componentCls:e,borderRadiusSM:t,borderRadiusLG:n},r)=>{const a=r==="lg"?n:t;return{[`&-${r}`]:{[`${e}-handler-wrap`]:{borderStartEndRadius:a,borderEndEndRadius:a},[`${e}-handler-up`]:{borderStartEndRadius:a},[`${e}-handler-down`]:{borderEndEndRadius:a}}}},_n=e=>{const{componentCls:t,lineWidth:n,lineType:r,borderRadius:a,inputFontSizeSM:o,inputFontSizeLG:g,controlHeightLG:c,controlHeightSM:m,colorError:v,paddingInlineSM:d,paddingBlockSM:y,paddingBlockLG:E,paddingInlineLG:w,colorIcon:l,motionDurationMid:u,handleHoverColor:I,handleOpacity:C,paddingInline:x,paddingBlock:S,handleBg:p,handleActiveBg:O,colorTextDisabled:B,borderRadiusSM:R,borderRadiusLG:D,controlWidth:T,handleBorderColor:k,filledHandleBg:F,lineHeightLG:M,calc:W}=e;return[{[t]:Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({},$e(e)),at(e)),{display:"inline-block",width:T,margin:0,padding:0,borderRadius:a}),an(e,{[`${t}-handler-wrap`]:{background:p,[`${t}-handler-down`]:{borderBlockStart:`${A(n)} ${r} ${k}`}}})),on(e,{[`${t}-handler-wrap`]:{background:F,[`${t}-handler-down`]:{borderBlockStart:`${A(n)} ${r} ${k}`}},"&:focus-within":{[`${t}-handler-wrap`]:{background:p}}})),un(e,{[`${t}-handler-wrap`]:{background:p,[`${t}-handler-down`]:{borderBlockStart:`${A(n)} ${r} ${k}`}}})),ln(e)),{"&-rtl":{direction:"rtl",[`${t}-input`]:{direction:"rtl"}},"&-lg":{padding:0,fontSize:g,lineHeight:M,borderRadius:D,[`input${t}-input`]:{height:W(c).sub(W(n).mul(2)).equal(),padding:`${A(E)} ${A(w)}`}},"&-sm":{padding:0,fontSize:o,borderRadius:R,[`input${t}-input`]:{height:W(m).sub(W(n).mul(2)).equal(),padding:`${A(y)} ${A(d)}`}},"&-out-of-range":{[`${t}-input-wrap`]:{input:{color:v}}},"&-group":Object.assign(Object.assign(Object.assign({},$e(e)),cn(e)),{"&-wrapper":Object.assign(Object.assign(Object.assign({display:"inline-block",textAlign:"start",verticalAlign:"top",[`${t}-affix-wrapper`]:{width:"100%"},"&-lg":{[`${t}-group-addon`]:{borderRadius:D,fontSize:e.fontSizeLG}},"&-sm":{[`${t}-group-addon`]:{borderRadius:R}}},dn(e)),pn(e)),{[`&:not(${t}-compact-first-item):not(${t}-compact-last-item)${t}-compact-item`]:{[`${t}, ${t}-group-addon`]:{borderRadius:0}},[`&:not(${t}-compact-last-item)${t}-compact-first-item`]:{[`${t}, ${t}-group-addon`]:{borderStartEndRadius:0,borderEndEndRadius:0}},[`&:not(${t}-compact-first-item)${t}-compact-last-item`]:{[`${t}, ${t}-group-addon`]:{borderStartStartRadius:0,borderEndStartRadius:0}}})}),[`&-disabled ${t}-input`]:{cursor:"not-allowed"},[t]:{"&-input":Object.assign(Object.assign(Object.assign(Object.assign({},$e(e)),{width:"100%",padding:`${A(S)} ${A(x)}`,textAlign:"start",backgroundColor:"transparent",border:0,borderRadius:a,outline:0,transition:`all ${u} linear`,appearance:"textfield",fontSize:"inherit"}),sn(e.colorTextPlaceholder)),{'&[type="number"]::-webkit-inner-spin-button, &[type="number"]::-webkit-outer-spin-button':{margin:0,appearance:"none"}})},[`&:hover ${t}-handler-wrap, &-focused ${t}-handler-wrap`]:{width:e.handleWidth,opacity:1}})},{[t]:Object.assign(Object.assign(Object.assign({[`${t}-handler-wrap`]:{position:"absolute",insetBlockStart:0,insetInlineEnd:0,width:e.handleVisibleWidth,opacity:C,height:"100%",borderStartStartRadius:0,borderStartEndRadius:a,borderEndEndRadius:a,borderEndStartRadius:0,display:"flex",flexDirection:"column",alignItems:"stretch",transition:`all ${u}`,overflow:"hidden",[`${t}-handler`]:{display:"flex",alignItems:"center",justifyContent:"center",flex:"auto",height:"40%",[`
              ${t}-handler-up-inner,
              ${t}-handler-down-inner
            `]:{marginInlineEnd:0,fontSize:e.handleFontSize}}},[`${t}-handler`]:{height:"50%",overflow:"hidden",color:l,fontWeight:"bold",lineHeight:0,textAlign:"center",cursor:"pointer",borderInlineStart:`${A(n)} ${r} ${k}`,transition:`all ${u} linear`,"&:active":{background:O},"&:hover":{height:"60%",[`
              ${t}-handler-up-inner,
              ${t}-handler-down-inner
            `]:{color:I}},"&-up-inner, &-down-inner":Object.assign(Object.assign({},Ft()),{color:l,transition:`all ${u} linear`,userSelect:"none"})},[`${t}-handler-up`]:{borderStartEndRadius:a},[`${t}-handler-down`]:{borderEndEndRadius:a}},Ye(e,"lg")),Ye(e,"sm")),{"&-disabled, &-readonly":{[`${t}-handler-wrap`]:{display:"none"},[`${t}-input`]:{color:"inherit"}},[`
          ${t}-handler-up-disabled,
          ${t}-handler-down-disabled
        `]:{cursor:"not-allowed"},[`
          ${t}-handler-up-disabled:hover &-handler-up-inner,
          ${t}-handler-down-disabled:hover &-handler-down-inner
        `]:{color:B}})}]},On=e=>{const{componentCls:t,paddingBlock:n,paddingInline:r,inputAffixPadding:a,controlWidth:o,borderRadiusLG:g,borderRadiusSM:c,paddingInlineLG:m,paddingInlineSM:v,paddingBlockLG:d,paddingBlockSM:y,motionDurationMid:E}=e;return{[`${t}-affix-wrapper`]:Object.assign(Object.assign({[`input${t}-input`]:{padding:`${A(n)} 0`}},at(e)),{position:"relative",display:"inline-flex",alignItems:"center",width:o,padding:0,paddingInlineStart:r,"&-lg":{borderRadius:g,paddingInlineStart:m,[`input${t}-input`]:{padding:`${A(d)} 0`}},"&-sm":{borderRadius:c,paddingInlineStart:v,[`input${t}-input`]:{padding:`${A(y)} 0`}},[`&:not(${t}-disabled):hover`]:{zIndex:1},"&-focused, &:focus":{zIndex:1},[`&-disabled > ${t}-disabled`]:{background:"transparent"},[`> div${t}`]:{width:"100%",border:"none",outline:"none",[`&${t}-focused`]:{boxShadow:"none !important"}},"&::before":{display:"inline-block",width:0,visibility:"hidden",content:'"\\a0"'},[`${t}-handler-wrap`]:{zIndex:2},[t]:{position:"static",color:"inherit","&-prefix, &-suffix":{display:"flex",flex:"none",alignItems:"center",pointerEvents:"none"},"&-prefix":{marginInlineEnd:a},"&-suffix":{insetBlockStart:0,insetInlineEnd:0,height:"100%",marginInlineEnd:r,marginInlineStart:a,transition:`margin ${E}`}},[`&:hover ${t}-handler-wrap, &-focused ${t}-handler-wrap`]:{width:e.handleWidth,opacity:1},[`&:not(${t}-affix-wrapper-without-controls):hover ${t}-suffix`]:{marginInlineEnd:e.calc(e.handleWidth).add(r).equal()}}),[`${t}-underlined`]:{borderRadius:0}}},Dn=Ot("InputNumber",e=>{const t=Dt(e,rn(e));return[_n(t),On(t),Bt(t)]},kn,{unitless:{handleOpacity:!0},resetFont:!1});var Bn=function(e,t){var n={};for(var r in e)Object.prototype.hasOwnProperty.call(e,r)&&t.indexOf(r)<0&&(n[r]=e[r]);if(e!=null&&typeof Object.getOwnPropertySymbols=="function")for(var a=0,r=Object.getOwnPropertySymbols(e);a<r.length;a++)t.indexOf(r[a])<0&&Object.prototype.propertyIsEnumerable.call(e,r[a])&&(n[r[a]]=e[r[a]]);return n};const ot=i.forwardRef((e,t)=>{const{getPrefixCls:n,direction:r}=i.useContext(Mt),a=i.useRef(null);i.useImperativeHandle(t,()=>a.current);const{className:o,rootClassName:g,size:c,disabled:m,prefixCls:v,addonBefore:d,addonAfter:y,prefix:E,suffix:w,bordered:l,readOnly:u,status:I,controls:C,variant:x}=e,S=Bn(e,["className","rootClassName","size","disabled","prefixCls","addonBefore","addonAfter","prefix","suffix","bordered","readOnly","status","controls","variant"]),p=n("input-number",v),O=At(p),[B,R,D]=Dn(p,O),{compactSize:T,compactItemClassnames:k}=Vt(p,r);let F=i.createElement(Zt,{className:`${p}-handler-up-inner`}),M=i.createElement(rt,{className:`${p}-handler-down-inner`});const W=typeof C=="boolean"?C:void 0;typeof C=="object"&&(F=typeof C.upIcon>"u"?F:i.createElement("span",{className:`${p}-handler-up-inner`},C.upIcon),M=typeof C.downIcon>"u"?M:i.createElement("span",{className:`${p}-handler-down-inner`},C.downIcon));const{hasFeedback:ee,status:ge,isFormItemInput:he,feedbackIcon:oe}=i.useContext(jt),L=fn(ge,I),G=Tt($=>{var J;return(J=c??T)!==null&&J!==void 0?J:$}),ue=i.useContext(Pt),X=m??ue,[te,V]=mn("inputNumber",x,l),H=ee&&i.createElement(i.Fragment,null,oe),Y=z({[`${p}-lg`]:G==="large",[`${p}-sm`]:G==="small",[`${p}-rtl`]:r==="rtl",[`${p}-in-form-item`]:he},R),be=`${p}-group`,le=i.createElement(Rn,Object.assign({ref:a,disabled:X,className:z(D,O,o,g,k),upHandler:F,downHandler:M,prefixCls:p,readOnly:u,controls:W,prefix:E,suffix:H||w,addonBefore:d&&i.createElement(Le,{form:!0,space:!0},d),addonAfter:y&&i.createElement(Le,{form:!0,space:!0},y),classNames:{input:Y,variant:z({[`${p}-${te}`]:V},He(p,L,ee)),affixWrapper:z({[`${p}-affix-wrapper-sm`]:G==="small",[`${p}-affix-wrapper-lg`]:G==="large",[`${p}-affix-wrapper-rtl`]:r==="rtl",[`${p}-affix-wrapper-without-controls`]:C===!1||X||u},R),wrapper:z({[`${be}-rtl`]:r==="rtl"},R),groupWrapper:z({[`${p}-group-wrapper-sm`]:G==="small",[`${p}-group-wrapper-lg`]:G==="large",[`${p}-group-wrapper-rtl`]:r==="rtl",[`${p}-group-wrapper-${te}`]:V},He(`${p}-group-wrapper`,L,ee),R)}},S));return B(le)}),ut=ot,Fn=e=>i.createElement(Wt,{theme:{components:{InputNumber:{handleVisible:!0}}}},i.createElement(ot,Object.assign({},e)));ut._InternalPanelDoNotUseOrYouWillBeFired=Fn;var Mn=function(e){return e.every(function(t){var n=ke(t);return n?n.getRootNode()instanceof ShadowRoot:!1})},An=function(e){return e?e.getRootNode():document},Vn=function(e){if(!e||!document.getRootNode)return document;var t=Array.isArray(e)?e:[e];return Mn(t)?An(ke(t[0])):document};function jn(e,t,n){n===void 0&&(n="click");var r=zt(e);Lt(function(){var a=function(c){var m=Array.isArray(t)?t:[t];m.some(function(v){var d=ke(v);return!d||d.contains(c.target)})||r.current(c)},o=Vn(t),g=Array.isArray(n)?n:[n];return g.forEach(function(c){return o.addEventListener(c,a)}),function(){g.forEach(function(c){return o.removeEventListener(c,a)})}},Array.isArray(n)?n:[n],t)}var Tn=`.phone-input-item-container {
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
`,Pn=e=>{let t=e.form,n=q.useWatch(e.name,t),[r,a]=i.useState(["United States","us","1"]),{t:o}=et(),[g,c]=i.useState(!1),m=i.useRef(null),v=i.useRef(null),[d,y]=i.useState(""),E=i.useRef(null),w=i.useMemo(()=>We.filter(l=>l.join("+").toLowerCase().includes(d.toLowerCase())),[d]);return jn(()=>{c(!1)},m),i.useEffect(()=>{g&&y("")},[g]),i.useEffect(()=>{if(n!=null&&n.includes("*"))return;let l=`+${r[2]}`,u=(n||"").replace(/^\+\d+/,"").trim();t.setFieldsValue({[e.name]:`${l} ${u}`}),u&&t.validateFields(["_phone"])},[r,n]),i.useEffect(()=>{var l;try{if((l=n==null?void 0:n.includes)!=null&&l.call(n,"*"))t.setFieldsValue({_phone:n});else if(n){if(Ge(n)){let u=tt(n),I=u.nationalNumber;t.setFieldsValue({_phone:I});let C=u.countryCallingCode.toString(),x=u.country;if(C&&x){let S=We.filter(p=>p[2].toString()===C&&p[1].toLowerCase()===x.toLowerCase());S&&S.length>0&&a(S[S.length-1])}}}else{let u=wt();u&&a(u)}}catch{}},[n]),h.createElement(h.Fragment,null,h.createElement("style",null,nt(Tn)),h.createElement("div",{className:"phone-input-item-container"},h.createElement(q.Item,{className:!e.disabled||e.disabled&&e.previewMode!=="input"?"hidden":"",extra:e.extra,name:e.name},h.createElement(Ce,{disabled:e.disabled})),h.createElement(q.Item,{name:"_phone",className:e.disabled&&e.previewMode=="input"?"hidden":"",extra:e.extra,rules:[{required:!0,validator:(l,u)=>{try{if(u)try{if(u=`+${r[2]} ${u}`,!Ge(u))return Promise.reject(o("login.phone_format_error"))}catch{return Promise.reject(o("login.phone_format_error"))}else return Promise.reject(o("login.input_phone_holder"))}catch{return Promise.reject(o("login.phone_format_error"))}return Promise.resolve()}}]},h.createElement(ut,{placeholder:o("account.mobile"),disabled:e.disabled,controls:!1,onChange:l=>{t.setFieldsValue({[e.name]:`+${r[2]} ${l}`})},onFocus:()=>{var l;(l=document.querySelector(".ant-input-number-group-wrapper"))==null||l.setAttribute("data-focus","true")},onBlur:()=>{var l;(l=document.querySelector(".ant-input-number-group-wrapper"))==null||l.setAttribute("data-focus","false")},addonBefore:h.createElement("div",{className:"country-box phone",ref:v},h.createElement("div",{className:"prefix-wrap",onClick:()=>{e.disabled||(c(!g),setTimeout(()=>{var l;(l=E.current)==null||l.focus()}))},ref:m},h.createElement("div",{className:"account-select-opt"},h.createElement("div",{className:"account-select-icon"},qe(`${r[1]}`)),h.createElement(rt,{className:"down-more"})),h.createElement("span",null,"+",r[2])),g&&h.createElement("div",{className:"account-select-country-list "},h.createElement("div",{className:"account-select-country-item search-input-wrap",onClick:l=>{l.stopPropagation()}},h.createElement(Ce,{ref:E,className:"search-input",type:"text",placeholder:o("login.search_country_holder"),allowClear:!0,onChange:l=>{var u;let I=((u=l==null?void 0:l.target)==null?void 0:u.value)||"";y(I)}})),w&&w.length?h.createElement("div",{className:"p-country-list"},w.map((l,u)=>h.createElement("div",{key:`${l[0]}-${l[1]}-${l[2]}`,className:"account-select-country-item",onClick:()=>{a(l),c(!1)}},h.createElement("div",{className:"country-box"},h.createElement("div",{className:"country-flag"},qe(`${l[1]}`)),h.createElement("span",{className:"country-name"},l[0])),h.createElement("div",{className:"country-code"},"+"+l[2])))):h.createElement("div",{className:"no-data"},"No data")))}))))},Wn=Pn,zn=`.login-account-bind {
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
`,Ln=e=>{let t=e,n=(t==null?void 0:t.authType)||"",r=(t==null?void 0:t.verifyToken)||"",{t:a}=et(),[o]=q.useForm(),g=Gt(),c=Ht(),{userInfo:m}=qt(),{showSelectSecurityAccount:v}=Ut(),[d,y]=i.useState(!1),{runAsync:E}=Qt(Jt,{manual:!0}),{authCoreModal:w}=Kt(),l=i.useMemo(()=>St({userInfo:m,t:a}),[m,a]),u=i.useMemo(()=>{var x;return((x=l==null?void 0:l.find)==null?void 0:x.call(l,S=>S.type===n))||{}},[l,n]),I=i.useMemo(()=>!u.value&&!u.id,[u]);i.useMemo(()=>!u.isOriginal&&!I,[u]);let C=()=>{o.validateFields().then(x=>{var S,p,O,B,R,D,T;let k=((B=(O=(p=(S=o.getFieldsValue())==null?void 0:S.inputValue)==null?void 0:p.replace(/\s/g,""))==null?void 0:O.trim)==null?void 0:B.call(O))||"";if(y(!0),n==="phone"&&((R=m==null?void 0:m.security_account)==null?void 0:R.phone)===k){Ie.error({title:a("new.duplicate_phonel_bindings"),wrapClassName:"auth-core-modal-error",getContainer:()=>w.rootBody}),y(!1);return}else if(n==="email"&&((T=(D=m==null?void 0:m.security_account)==null?void 0:D.email)==null?void 0:T.toLowerCase())===(k==null?void 0:k.toLowerCase())){Ie.error({title:a("new.duplicate_email_bindings"),wrapClassName:"auth-core-modal-error",getContainer:()=>w.rootBody}),y(!1);return}let F={};n===ce.phone?F.phone=k:F.email=k,E(F).then(M=>{g("/account/verify",{state:{account:k,authType:n,verifyToken:r,pageType:"bind_login_account"}}),y(!1)}).catch(M=>{y(!1),M.error_code===20109?Ie.error({title:n===ce.phone?a("error.server_phone_20109"):a("error.server_email_20109"),wrapClassName:"auth-core-modal-error",getContainer:()=>w.rootBody}):c.error(M.message)})})};return Nt(x=>{g("/account/verify",{state:{account:x.account,authType:n,unbindAccount:o.getFieldValue("inputValue"),pageType:"unbind_login_account"}})},{wait:3e3}),i.useEffect(()=>{if(u!=null&&u.value||u!=null&&u.id)if(n===ce.phone){let x=tt(u==null?void 0:u.value.replace(/\s/g,"")),S=x.countryCallingCode,p=x.nationalNumber;o.setFieldsValue({inputValue:ze(`+${S} ${p}`)})}else o.setFieldsValue({inputValue:ze((u==null?void 0:u.value)||(u==null?void 0:u.id)||"")})},[u==null?void 0:u.value,u==null?void 0:u.id,n]),h.createElement("div",{className:"login-account-bind "},h.createElement("style",null,nt(zn)),h.createElement(Et,{displayBackBtn:!0},u.name),h.createElement(q,{className:"account-bind-form",layout:"vertical",form:o,onFinish:C},n===ce.phone?h.createElement(Wn,{name:"inputValue",form:o,disabled:!I,previewMode:"input",extra:h.createElement("div",{className:"link-account-hint"},a("new.link_account_hint").format(u.name))}):h.createElement(q.Item,{name:"inputValue",validateTrigger:"onBlur",extra:h.createElement("div",{className:"link-account-hint"},a("new.link_account_hint").format(u.name)),rules:[{required:!0,validator:async(x,S)=>{if(S){if(!Xt.test(S))return Promise.reject(a("login.email_format_error"))}else return Promise.reject(a("account.input_vaild_email"));return Promise.resolve()}}]},h.createElement(Ce,{className:"account-input",placeholder:u.name,disabled:!I,onChange:x=>o.setFields([{name:"email",value:x.target.value,errors:[]}])})),h.createElement(q.Item,null,I?h.createElement(Yt,{className:"primary-antd-btn link-btn",loading:d,htmlType:"submit"},a("account.link")):h.createElement(h.Fragment,null))),h.createElement($t,null))},ir=Ln;export{ir as default};
