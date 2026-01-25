import{_ as i,v as a,w as t}from"./index-CrVsRjMv.js";var n,s,r,e,l,d=i({"src/components/wallets/styles.ts"(){n=a(t.div)`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,s=a(t.div)`
  height: 22px;
  width: 22px;
  border-radius: 6px;
  overflow: hidden;

  svg {
    width: 100%;
    height: 100%;
  }
`,r=a(t.div)`
  position: absolute;
  margin: auto 16px;
  right: 0;
  height: 25px;
  background: ${o=>o.$customLable?"var(--pcm-wallet-lable-background)":"var(--pcm-body-background-secondary)"};
  color: ${o=>o.$customLable?"var(--pcm-wallet-lable-color)":"var(--pcm-body-color-secondary)"};
  font-size: 12px;
  font-weight: 300;
  text-align: center;
  line-height: 25px;
  padding: 0 10px 0 21px;
  border-radius: 25px;
  max-width: 40%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition-property: opacity, transform;
  opacity: 1;
  transition-duration: 200ms;

  &:before {
    content: '';
    position: absolute;
    height: 7px;
    width: 7px;
    background: ${o=>o.$customLable?"var(--pcm-wallet-lable-color)":"var(--pcm-accent-color)"};
    border-radius: 50%;
    top: 9px;
    left: 10px;
  }
`,e=a(t.div)`
  margin: auto 0;
  position: absolute;
  right: 26px;
  opacity: 0;
  transition-property: opacity, transform;
  transition-duration: 200ms;
  color: var(--pcm-body-color);
`,l=a(t.div)`
  width: 100%;
  height: 47px;
  border: 1px solid var(--pcm-button-border-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-radius: var(--pcm-rounded-lg);
  gap: 12px;
  position: relative;
  user-select: none;

  @media only screen and (min-width: 560px) {
    &:hover {
      box-shadow: var(--pcm-button-hover-shadow);
      ${r} {
        opacity: 0;
        transform: translateX(-15px);
      }

      ${e} {
        opacity: 1;
        transform: translateX(10px);
      }
    }
  }

  @media only screen and (max-width: 560px) {
    &:hover:active {
      box-shadow: var(--pcm-button-hover-shadow);
      ${r} {
        opacity: 0;
        transform: translateX(-15px);
      }

      ${e} {
        opacity: 1;
        transform: translateX(10px);
      }
    }
  }
  &.all-wallets-btn {
    background: var(--pcm-body-background-secondary);
    border: none;
    font-weight: 500;
    &:hover {
      box-shadow: none;
    }
  }
`}});export{e as F,l as W,r as a,n as b,s as c,d as i};
