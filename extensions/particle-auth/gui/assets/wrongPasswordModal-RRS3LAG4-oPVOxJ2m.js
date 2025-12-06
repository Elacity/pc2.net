import{$ as F,Y as _,aw as N,ap as k,r as d,a4 as t,a5 as C,aG as M,aH as B,ao as g}from"./index-ChURtahf.js";import{u as P}from"./index-Ce4aghiP.js";var S=`.ant-modal-content .ant-modal-footer {
  display: none;
}
.wrong-password-content {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.wrong-password-content .modal-title {
  font-size: 22px;
  font-weight: bold;
  position: relative;
  top: 7px;
  margin-bottom: 12px;
}
.wrong-password-content .tip {
  padding-right: 10px;
  padding-left: 10px;
  margin-top: 16px;
  margin-bottom: 20px;
  font-weight: 400;
  font-size: 17px;
  line-height: 1.3;
  text-align: center;
  color: var(--secondary-text-color);
}
.wrong-password-content .frozen-countdown {
  margin-top: 12px;
  margin-bottom: 22px;
  font-weight: bold;
  font-size: 24px;
  color: var(--text-color);
}
.wrong-password-content .btn {
  width: 100%;
  height: 47px;
  margin-top: 10px;
  border-radius: var(--primary-btn-border-radius);
  font-size: var(--primary-btn-font-size);
  color: var(--primary-btn-color);
  background: var(--primary-btn-background-color);
  opacity: 1;
}
.wrong-password-content .close-icon {
  align-self: flex-end;
}
`,I=({info:o})=>{var u;let{t:l}=F(),{setWrongPassword:p,setPaymentVerify:v,userInfo:n,showSelectSecurityAccount:w}=_(),y=N(),x=()=>{p({visible:!1}),v({visible:!1}),h()},{authCoreModal:b}=k(),h=()=>{var e,a,r,c;(e=n==null?void 0:n.security_account)!=null&&e.email&&((a=n==null?void 0:n.security_account)!=null&&a.phone)?w(!0):y("/account/set-password",{state:{account:((r=n==null?void 0:n.security_account)==null?void 0:r.email)||((c=n==null?void 0:n.security_account)==null?void 0:c.phone)}})},s=()=>{p({visible:!1})},[E,i]=d.useState(),[m,f]=d.useState(((u=o.accountFrozen)==null?void 0:u.seconds)||0);P(()=>{let e=m-1;f(e),e<=0&&(i(void 0),s())},E),d.useEffect(()=>(o.accountFrozen&&(f(o.accountFrozen.seconds),i(1e3)),()=>{i(void 0)}),[o.accountFrozen]);let z=e=>{let a=Math.floor(e/60/60);a=a<10?"0"+a:a;let r=Math.floor(e/60%60);r=r<10?"0"+r:r;let c=Math.floor(e%60);return c=c<10?"0"+c:c,a+":"+r+":"+c};return t.createElement(t.Fragment,null,t.createElement("style",null,C(S)),t.createElement(M,{open:o.visible,closable:!1,centered:!0,okButtonProps:{style:{display:"none"}},cancelButtonProps:{style:{display:"none"}},getContainer:()=>b.rootBody},t.createElement("div",{className:"wrong-password-content"},t.createElement(B,{className:"close-icon",onClick:s}),o.accountFrozen?t.createElement(t.Fragment,null,t.createElement("div",{className:"modal-title"},l("account.incorrect_payment_password")),t.createElement("div",{className:"tip m-margin-top-20"},l("account.incorrect_tip2"))):t.createElement("div",{className:"tip m-margin-top-20"},l("account.incorrect_tip1")),o.accountFrozen&&t.createElement("div",{className:"frozen-countdown"},z(m)),t.createElement(g,{className:"btn",onClick:x},l("account.forgot_password")),!o.accountFrozen&&t.createElement(g,{className:"btn",onClick:s},l("account.retry")))))},D=I;export{D as default};
