import{$ as h,Y as f,aw as y,ap as g,a4 as a,a5 as x,br as w,ao as d,aD as E,aE as _,a0 as p}from"./index-DrHntCRl.js";var k=`.select-account-drawer .ant-drawer-body {
  padding: 18px !important;
}
.select-account {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
}
.select-account .close-icon {
  position: absolute;
  top: 10px;
  right: 10px;
}
.select-account .account-btn {
  width: 100%;
  height: 47px;
  border: none;
  border-radius: var(--primary-btn-border-radius);
  outline: none;
  font-size: var(--primary-btn-font-size);
  line-height: 22px;
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
}
.select-account .account-btn:hover {
  opacity: var(--hover-opacity);
}
.select-account .select-account-title {
  padding-top: 24px;
  padding-bottom: 24px;
  font-weight: 500;
  font-size: 20px;
  line-height: 1;
  color: var(--text-color);
}
`,C=m=>{var c,n,l;let{t:o}=h(),{visible:v,state:r}=m,{showSelectSecurityAccount:i,userInfo:e}=f(),s=y(),{authCoreModal:b}=g(),u=(t,N)=>{r?s("/account/verify",{state:{account:t,...r}}):s("/account/set-password",{state:{account:t}}),i(!1)};return a.createElement(a.Fragment,null,a.createElement("style",null,x(k)),a.createElement(w,{title:(c=o("account.modal_select_verification"))!=null?c:"",placement:"bottom",closable:!1,className:"select-account-drawer",visible:v,maskClosable:!0,forceRender:!0,height:220,onClose:()=>i(!1),getContainer:()=>b.rootBody},a.createElement("div",{className:"select-account"},a.createElement(d,{className:"account-btn",onClick:()=>{var t;return u((t=e==null?void 0:e.security_account)==null?void 0:t.email,p.email)}},`${o("account.email")} - ${E(((n=e==null?void 0:e.security_account)==null?void 0:n.email)||"")}`),a.createElement(d,{className:"account-btn",onClick:()=>{var t;return u((t=e==null?void 0:e.security_account)==null?void 0:t.phone,p.phone)}},`${o("account.mobile")} - ${_(((l=e==null?void 0:e.security_account)==null?void 0:l.phone)||"")}`))))},z=C;export{z as default};
