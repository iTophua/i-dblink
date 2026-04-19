import { Input, InputProps } from 'antd';
import React from 'react';

export const GlobalInput: React.FC<InputProps> = (props) => {
  return <Input autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};

export const GlobalInputPassword: React.FC<InputProps> = (props) => {
  return <Input.Password autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};

export const GlobalTextArea: React.FC<InputProps> = (props) => {
  return <Input.TextArea autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};

export const GlobalSearch: React.FC<InputProps> = (props) => {
  return <Input.Search autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} {...props} />;
};
