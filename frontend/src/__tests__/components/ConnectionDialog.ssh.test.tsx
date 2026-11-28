/**
 * SSH 隧道的认证方式要能选：选私钥时显示私钥文件和口令、不显示密码，保存出去的
 * ssh_auth_method 是 key。此前界面上只有私钥文件的输入框、没有开关，存下来的方法
 * 始终是 password——选了私钥文件也照样用密码去认证。
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';

const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
  if (!('ResizeObserver' in window)) {
    // @ts-expect-error 测试环境补齐浏览器 API
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const t = (key: string) => key;
  return { ...actual, useTranslation: () => ({ t, i18n: { language: 'en-US', t } }) };
});

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>();
  return { ...actual, App: { ...actual.App, useApp: () => ({ message }) } };
});

import { ConnectionDialog } from '../../components/ConnectionDialog';

const KEY_PATH = '/Users/me/.ssh/id_ed25519';
const KEY_PATH_INPUT = 'common.selectPrivateKeyFilePath';
const PASSPHRASE_INPUT = 'common.sshPassphrasePlaceholder';
const PASSWORD_INPUT = 'common.sshPassword';

/** 打开弹窗并切到 SSH 页 */
async function openSshTab(props: Partial<React.ComponentProps<typeof ConnectionDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(<ConnectionDialog open onCancel={vi.fn()} onSave={onSave} {...props} />);
  const tab = await screen.findByText('SSH');
  await act(async () => {
    fireEvent.click(tab);
  });
  return { onSave };
}

/** 点「认证方式」里的一项（antd Segmented：文字在 label 里，单选框是它的子元素） */
async function pickAuth(label: string) {
  const option = screen.getByText(label).closest('label');
  expect(option).toBeTruthy();
  await act(async () => {
    fireEvent.click(option!.querySelector('input')!);
  });
}

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByTestId('conn-save-btn'));
  });
};

const inputValue = (placeholder: string) =>
  (screen.getByPlaceholderText(placeholder) as HTMLInputElement).value;

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConnectionDialog SSH 认证方式', () => {
  it('默认密码认证：有密码输入框，没有私钥文件和口令', async () => {
    await openSshTab();

    expect(screen.getByPlaceholderText(PASSWORD_INPUT)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(KEY_PATH_INPUT)).toBeNull();
    expect(screen.queryByPlaceholderText(PASSPHRASE_INPUT)).toBeNull();
  });

  // 以前私钥文件的输入框只是摆设：没有认证方式开关，选了文件也走密码
  it('选私钥：换成私钥文件和口令，没选文件不能保存', async () => {
    const { onSave } = await openSshTab();

    await pickAuth('common.sshAuthPrivateKey');

    await waitFor(() => expect(screen.getByPlaceholderText(KEY_PATH_INPUT)).toBeInTheDocument());
    expect(screen.queryByPlaceholderText(PASSWORD_INPUT)).toBeNull();
    expect(screen.getByPlaceholderText(PASSPHRASE_INPUT)).toBeInTheDocument();

    await save();

    await waitFor(() =>
      expect(screen.getByText('common.privateKeyFileRequired')).toBeInTheDocument()
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it('私钥认证的连接：回显私钥路径和口令，保存时认证方式是 key', async () => {
    const { onSave } = await openSshTab({
      editingData: {
        id: 'c1',
        name: 'prod',
        dbType: 'mysql',
        host: '10.0.0.1',
        port: 3306,
        username: 'app',
        database: 'app',
        sshEnabled: true,
        sshHost: 'jump.example.com',
        sshPort: 22,
        sshUsername: 'me',
        sshAuthMethod: 'key',
        sshPrivateKeyPath: KEY_PATH,
        sshPassphrase: 'secret',
      },
    });

    expect(screen.queryByPlaceholderText(PASSWORD_INPUT)).toBeNull();
    expect(inputValue(KEY_PATH_INPUT)).toBe(KEY_PATH);
    expect(inputValue(PASSPHRASE_INPUT)).toBe('secret');

    await save();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      sshAuthMethod: 'key',
      sshPrivateKeyPath: KEY_PATH,
      sshPassphrase: 'secret',
    });
    expect(onSave.mock.calls[0][0].sshPassword).toBeUndefined();
  });

  // 文件路径输入框此前绑不到表单值：选了证书、编辑已有连接时都是空的
  it('编辑连接：SSL 页回显已保存的证书路径', async () => {
    await openSshTab({
      editingData: {
        id: 'c2',
        name: 'tls',
        dbType: 'postgresql',
        host: '10.0.0.2',
        port: 5432,
        username: 'app',
        database: 'app',
        sslEnabled: true,
        sslCaPath: '/certs/ca.pem',
        sslCertPath: '/certs/client.crt',
        sslKeyPath: '/certs/client.key',
      },
    });
    await act(async () => {
      fireEvent.click(screen.getByText('SSL'));
    });

    expect(inputValue('common.selectCaCertificateFile')).toBe('/certs/ca.pem');
    expect(inputValue('common.selectCertificate')).toBe('/certs/client.crt');
    expect(inputValue('common.selectPrivateKey')).toBe('/certs/client.key');
  });

  // SSH 页没打开时私钥文件的必填规则不会执行：停在常规页直接保存，不能存下一个
  // 「私钥认证却没有私钥」的连接（等连接时才报认证失败）
  it('私钥认证但没选私钥文件，停在常规页直接保存：拦住，切到 SSH 页提示', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ConnectionDialog
        open
        onCancel={vi.fn()}
        onSave={onSave}
        editingData={{
          id: 'c3',
          name: 'prod',
          dbType: 'mysql',
          host: '10.0.0.3',
          port: 3306,
          username: 'app',
          sshEnabled: true,
          sshHost: 'jump.example.com',
          sshPort: 22,
          sshUsername: 'me',
          sshAuthMethod: 'key',
        }}
      />
    );
    // 弹窗默认停在常规页
    await screen.findByText('common.tabGeneral');

    await save();

    await waitFor(() =>
      expect(message.warning).toHaveBeenCalledWith('common.privateKeyFileRequired')
    );
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByText('common.privateKeyFileRequired')).toBeInTheDocument()
    );

    // 选了私钥文件：红字消失（输入框绑着表单值，改它就等于选了文件）
    fireEvent.change(screen.getByPlaceholderText(KEY_PATH_INPUT), {
      target: { value: KEY_PATH },
    });
    await waitFor(() => expect(screen.queryByText('common.privateKeyFileRequired')).toBeNull());
  });
});
