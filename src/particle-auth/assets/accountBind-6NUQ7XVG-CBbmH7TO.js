import{t as Q,r as X}from"./chunk-UD6Q2AOH-DsQGa4dk.js";import{K as Y}from"./chunk-G2RSELDM-D_SeCTdl.js";import{d as U}from"./chunk-YNAB6HVU-BA-TibPS.js";import{p as D}from"./chunk-TT34D6R6-B6RO9i8A.js";import{aw as M,$ as V,an as H,r as a,am as O,ap as P,a4 as n,a5 as W,ao as F,b7 as ee,b8 as J,a2 as te,as as ne,at as Z,av as L,aC as ae,b9 as oe}from"./index-CRQsZryZ.js";import{u as K}from"./useRequest-DgqOJVy9.js";import{u as re}from"./index-BSxEkZP9.js";import{N as ie}from"./throttle-Bje8fjUc.js";import{g as q}from"./unicode-D4lwPBzr.js";import{R as ce}from"./DownOutlined-g_gbwdbP.js";import"./index-IP1FJr5O.js";var G=`.set-email-container {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  overflow: auto;
  color: var(--text-color);
}
.set-email-container .footer-box {
  position: absolute;
  bottom: 10px;
  margin: 0;
}
@media (max-height: 500px) {
  .set-email-container .footer-box {
    display: none;
  }
}
.set-email-container .display-none {
  display: none;
}
.set-email-container .error-tip {
  width: 90%;
  height: 0;
  padding-left: 10px;
  margin-top: 6px;
  margin-bottom: 0;
  text-align: left;
  color: red;
  opacity: 0;
  transition: all 0.3s;
}
.set-email-container .error-tip.show {
  height: 30px;
  opacity: 1;
}
.set-email-container .set-email-title {
  margin-top: 60px;
  font-size: 22px;
  color: var(--text-color);
}
.set-email-container .patment-tips1 {
  width: 80vw;
  margin-top: 30px;
  font-size: 14px;
  text-align: center;
  color: var(--text-color);
}
@media (min-width: 600px) {
  .set-email-container .patment-tips1 {
    width: calc(80 * var(--vw));
  }
}
.set-email-container .set-email-buttons {
  position: absolute;
  bottom: 0;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  height: auto;
  padding-bottom: 20px;
}
.set-email-container .success-icon {
  width: 50px;
  height: 50px;
  margin-top: 60px;
}
.set-email-container .set-email-desc-1 {
  box-sizing: border-box;
  padding: 0 18px;
  margin: 15px 0 25px;
  font-weight: 400;
  font-size: 14px;
  line-height: 16px;
  text-align: center;
  color: var(--text-color);
}
.set-email-container .account-input-box {
  position: relative;
  z-index: 3;
  width: 90%;
  height: 47px;
  margin-top: 28px;
  border-radius: var(--primary-btn-border-radius);
  line-height: 47px;
  color: var(--text-color);
  background-color: var(--input-background-color);
  opacity: 1;
}
.set-email-container .account-input-box .account-select-country {
  position: absolute;
  z-index: 2;
  top: 54px;
  left: 2%;
  width: 96%;
  height: 210px;
  border-radius: var(--card-border-radius) !important;
  overflow-y: auto;
  background-color: var(--input-background-color);
}
.set-email-container .account-input-box .account-select-country::-webkit-scrollbar {
  display: none;
  width: 0;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  height: 47px;
  padding: 5px 0 5px 13px;
  margin: 0;
  border-bottom: 1px solid var(--card-unclickable-background-color);
  font-size: 14px;
  color: var(--text-color);
  cursor: pointer;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item:hover {
  background-color: var(--card-unclickable-background-color);
}
.set-email-container .account-input-box .account-select-country .account-select-country-item div {
  display: flex;
  margin-right: 13px;
}
.set-email-container .account-input-box .account-select-country .account-select-country-item div .country-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.set-email-container .account-input-box input[type='number']::-webkit-inner-spin-button,
.set-email-container .account-input-box input[type='number']::-webkit-outer-spin-button {
  appearance: none;
  margin: 0;
}
.set-email-container .account-input-box.phone {
  display: flex;
  align-items: center;
  border: 1px solid var(--input-background-color);
  border-radius: var(--primary-btn-border-radius);
}
.set-email-container .account-input-box.phone[data-focus='true'] {
  border: 1px solid var(--accent-color) !important;
}
.set-email-container .account-input-box.phone input {
  border: none !important;
}
.set-email-container .account-input-box.phone input:focus {
  border: none !important;
}
.set-email-container .account-input-box .account-select-opt {
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  align-items: center;
  width: 60px;
  height: 100%;
  padding-left: 8px;
  cursor: pointer;
}
.set-email-container .account-input-box .account-select-opt .account-select-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  font-size: 15px;
}
.set-email-container .account-input-box .account-select-opt .down-more {
  margin-left: 8px;
  font-size: 10px;
}
.set-email-container .account-input-box span {
  flex-shrink: 0;
  margin: 0;
  font-size: 15px;
}
.set-email-container .account-input-box input {
  flex-shrink: 1;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 0 15px;
  outline: none;
  font-weight: 400;
  font-size: 15px;
  color: var(--text-color);
  background-color: transparent;
}
.set-email-container .send-code-btn {
  margin-bottom: 0 !important;
}
.set-email-container .account-submit-btn {
  width: 90%;
  height: 47px;
  padding: 0;
  margin-top: 38px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 500;
  font-size: var(--primary-btn-font-size);
  line-height: 47px;
  text-align: center;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
}
.set-email-container .account-submit-btn.bottom-margin {
  margin-bottom: 100px;
}
.set-email-container .account-submit-btn:hover {
  border: none;
  color: var(--primary-btn-color) !important;
  background: var(--primary-btn-background-color) !important;
  opacity: var(--hover-opacity);
}
.set-email-container .account-switch-item {
  margin-top: 40px;
  font-weight: 500;
  font-size: 13px;
  line-height: 19px;
  color: var(--accent-color);
  cursor: pointer;
}
.set-email-container .set-email-desc-2 {
  min-width: 116px;
  height: 23px;
  padding: 0 15px;
  border-radius: var(--primary-btn-border-radius);
  font-weight: 400;
  font-size: 12px;
  line-height: 23px;
  text-align: center;
  color: var(--secondary-text-color);
  background: var(--tag-background-color);
  opacity: 1;
}
.set-email-container .code-error {
  position: absolute;
  left: calc((100vw - 316px) / 2);
  margin-top: 220px;
  font-weight: 400;
  font-size: 12px;
  color: var(--error-color);
}
@media (min-width: 600px) {
  .set-email-container .code-error {
    left: calc((var(--vw) * 100 - 316px) / 2);
  }
}
.set-email-container .back {
  display: flex;
  align-items: center;
  height: 19px;
  margin-top: 90px;
  margin-bottom: 20px;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--accent-color);
  opacity: 1;
  cursor: pointer;
  gap: 8px;
}
.set-email-container .back svg {
  position: relative;
  top: 0;
  color: var(--accent-color);
}
.set-email-container .send-again {
  margin-top: 20px;
  border: none !important;
  outline: none !important;
  font-weight: 400;
  font-size: 16px;
  line-height: 19px;
  color: var(--text-color);
  background-color: transparent;
  box-shadow: none;
}
.set-email-container .send-again:hover {
  color: var(--text-color);
  background-color: transparent !important;
}
.set-email-container .send-again:disabled {
  opacity: 0.5;
}
`,le=$=>{let{bindAccount:c,backToInputAccount:r,redirectUrl:o="",verifyToken:E=""}=$,A=H(),{t:l}=V(),{themeType:_,language:f}=O(),d=M(),[s,N]=a.useState(""),[C,b]=a.useState(1e3),[i,g]=a.useState(60),[u,x]=a.useState(),B=a.useRef(null),{authCoreModal:I}=P(),[m,v]=a.useState(!1);re(()=>{if(i>0){let t=i-1;g(t),t===0&&b(void 0)}},C);let{run:h}=K(ee,{manual:!0,onBefore:()=>{v(!0)},onSuccess:t=>{ae(),o?d(o.split("?")[0],{replace:!0,back:!0,state:{...oe.parse(o.split("?")[1]),verifyToken:t==null?void 0:t.token,account:c}}):t.has_set_payment_password?d("/account/security",{replace:!0}):d("/account/set-password")},onError:t=>{(t==null?void 0:t.error_code)===L.InvalidCode?x(l("login.invalid_code")):(t==null?void 0:t.error_code)===L.ResendCode&&x(l("login.please_send_again"))},onFinally:()=>{setTimeout(()=>{v(!1)},2e3)}}),{loading:y,run:w}=K(J,{manual:!0,onSuccess:(t,p)=>{C||(g(60),b(1e3))},onError:t=>{g(0),b(void 0)}}),S=t=>{let p;c.includes("@")?p={email:c,code:t||s}:p={phone:c,code:t||s},E&&(p.token=E),h(p)},z=()=>{x(""),c.includes("@")?w({email:c}):Z({theme:_,language:f,getContainer:()=>I.rootBody}).then(t=>{w({phone:c,cf_turnstile_response:t})}).catch(t=>{A.error(l("error.server_20112"))})},k=t=>{N(t),x(""),t.length===6&&R(t)},R=a.useCallback(ie(t=>{S(t)},1e3,{leading:!0,trailing:!1}),[]);a.useEffect(()=>{var t;let p=document.getElementsByClassName("react-input-code"),j=T=>T.preventDefault();return(t=p[0])==null||t.addEventListener("contextmenu",j),()=>{var T;(T=p[0])==null||T.removeEventListener("contextmenu",j)}},[]);let e=()=>{var t;(t=document.getElementsByClassName("input-code-item")[Math.min(s.length,5)])==null||t.focus()};return n.createElement("div",{className:"set-email-container"},n.createElement("style",null,W(G)),n.createElement(U,{className:"icon-navigation-back",name:"circle_back",onClick:r}),n.createElement("h2",{className:"set-email-title"},l("account.enter_code")),n.createElement("p",{className:"set-email-desc-2",style:{margin:20}},c),n.createElement("div",{onClick:e},n.createElement(Y,{containerClassName:"react-input-code",inputClassName:"input-code-item",allowedCharacters:"numeric",length:6,ref:B,placeholder:" ",onChange:k})),u&&n.createElement("div",{className:"code-error"},u),n.createElement(F,{disabled:s.length!==6,className:"account-submit-btn",loading:m,onClick:()=>S()},l("common.confirm")),n.createElement(F,{className:"send-again",onClick:z,disabled:i>0||y},i>0?`${l("login.send_again")} (${i}s)`:l("login.send_again")),n.createElement("div",{className:"back",onClick:r},n.createElement(U,{className:"arrow1-icon",name:"arrow1_icon"}),n.createElement("span",null,l("login.back"))),n.createElement(D,null))},se=le,ue=$=>{let c=M(),{t:r}=V(),o=$,E=o==null?void 0:o.redirectUrl,A=o==null?void 0:o.verifyToken,l=H(),_=a.useRef(null),[f,d]=a.useState(""),[s,N]=a.useState(["United States","us","1"]),[C,b]=a.useState(!1),i=a.useRef(null),[g,u]=a.useState(""),{themeType:x,language:B}=O(),{authCoreModal:I}=P(),[m,v]=a.useState("email");a.useEffect(()=>{if(m==="phone"||o!=null&&o.showSwitch){let e=Q();e&&N(e)}},[m,o==null?void 0:o.showSwitch]);let[h,y]=a.useState(!1);a.useEffect(()=>{if(h)return document.addEventListener("click",w,!0),()=>{document.removeEventListener("click",w,!0)}},[h]);let w=e=>{setTimeout(()=>{var t;(t=_.current)!=null&&t.contains(e.target)||y(!1)})};a.useEffect(()=>{let e=o==null?void 0:o.accountType;e&&v(e)},[o]);let{loading:S,run:z}=K(J,{manual:!0,onSuccess:(e,t)=>{b(e)},onError:e=>{let t=(e==null?void 0:e.error_code)||0;(t===50003||t===50004)&&(d(""),i.current.value="")}}),k=()=>{let e=i.current.value;if(m==="email")if(e){if(!te.test(e))return u(r("login.email_format_error"))}else return u(r("account.input_vaild_email"));else{let t=s[1].toUpperCase();if(!e&&e!=="0")return u(r("account.input_vaild_mobile"));if(ne(e,t))e=`+${s[2]}${e}`;else return u(r("login.phone_format_error"))}d(e),e.includes("@")?z({email:e}):Z({theme:x,language:B,getContainer:()=>I.rootBody}).then(t=>{z({phone:e,cf_turnstile_response:t})}).catch(t=>{l.error(r("error.server_20112"))})},R=()=>{u(""),v(m==="email"?"phone":"email"),d("")};return a.useEffect(()=>{setTimeout(()=>{var e;(e=i.current)==null||e.focus()})},[]),C?n.createElement(se,{bindAccount:f,redirectUrl:E||"",verifyToken:A,backToInputAccount:()=>{b(!1)}}):n.createElement("div",{className:"set-email-container"},n.createElement("style",null,W(G)),n.createElement(U,{className:"icon-navigation-back",name:"circle_back",onClick:()=>c(-1)}),n.createElement("h2",{className:"set-email-title"},r(m==="email"?"account.set_your_email":"account.set_your_mobile")),n.createElement("p",{className:"set-email-desc-1"},r(m==="email"?"account.set_your_email_tip":"account.set_your_mobile_tip")),m==="email"?n.createElement(n.Fragment,null,n.createElement("div",{className:"account-input-box"},n.createElement("input",{onInput:()=>u(""),className:"input_email",type:"email",placeholder:r("account.place_email_address"),ref:i,defaultValue:f,onKeyDown:e=>{e.key==="Enter"&&k()}}))):n.createElement(n.Fragment,null,n.createElement("div",{className:"account-input-box phone",ref:_},h&&n.createElement("div",{className:"account-select-country"},X.map((e,t)=>n.createElement("p",{key:t,className:"account-select-country-item",onClick:()=>{N(e),y(!1)}},n.createElement("div",{className:"country-box"},n.createElement("div",{className:"country-flag"},q(`${e[1]}`)),n.createElement("span",{className:"country-name"},e[0])),n.createElement("div",{className:"country-code"},"+"+e[2])))),n.createElement("div",{className:"account-select-opt",onClick:()=>y(!h)},n.createElement("div",{className:"account-select-icon"},q(`${s[1]}`)),n.createElement(ce,{className:"down-more"})),n.createElement("span",null,"+",s[2]),n.createElement("input",{onInput:()=>{var e;u(""),i.current.value=((e=i.current.value.match(/^\d+/))==null?void 0:e[0])||""},type:"text",className:"no-number dd",placeholder:r("account.mobile"),ref:i,onWheel:e=>e.target.blur(),defaultValue:f.replace(`+${s[2]}`,""),onKeyDown:e=>{e.key==="Enter"&&k()},onFocus:()=>{var e;(e=document.querySelector(".account-input-box.phone"))==null||e.setAttribute("data-focus","true")},onBlur:()=>{var e;(e=document.querySelector(".account-input-box.phone"))==null||e.setAttribute("data-focus","false")}}))),n.createElement("p",{className:`error-tip ${g?"show":""}`},g),n.createElement(F,{className:"send-code-btn account-submit-btn bottom-margin",loading:S,onClick:k},r("login.get_captcha")),(o==null?void 0:o.showSwitch)&&n.createElement("div",{className:"account-switch-item",onClick:R},r(m==="email"?"account.switch_text_mobile":"account.switch_text_email")),n.createElement(D,null))},ke=ue;export{ke as default};
