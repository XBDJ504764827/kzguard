import { Alert, Button, Card, Input, Message, Space, Typography } from '@arco-design/web-react';
import { IconLock, IconUser } from '@arco-design/web-react/icon';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../contexts/AppStoreContext';
import { getErrorMessage } from '../utils/error';

export const LoginPage = () => {
  const navigate = useNavigate();
  const { login, bootstrapping, apiError } = useAppStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);

    try {
      await login(username, password);
      Message.success('登录成功');
      navigate('/', { replace: true });
    } catch (error) {
      Message.error(getErrorMessage(error, '登录失败'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--color-bg-1)',
      }}
    >
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title heading={3} style={{ marginBottom: 8 }}>
              登录 KZ Guard
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              请输入网站管理员账号与密码，登录后即可进入社区服管理后台。
            </Typography.Paragraph>
          </div>

          <Alert
            type="info"
            showIcon
            content="首次运行若不存在默认系统管理员，后端会自动创建默认账号：root_admin / Admin@123。"
          />

          {apiError ? <Alert type="warning" showIcon content={apiError} /> : null}

          <Space direction="vertical" size="medium" style={{ width: '100%' }}>
            <Input
              allowClear
              size="large"
              prefix={<IconUser />}
              value={username}
              onChange={setUsername}
              onPressEnter={() => {
                void handleLogin();
              }}
              placeholder="请输入管理员用户名"
            />
            <Input.Password
              size="large"
              prefix={<IconLock />}
              value={password}
              onChange={setPassword}
              onPressEnter={() => {
                void handleLogin();
              }}
              placeholder="请输入密码"
            />
            <Button
              long
              type="primary"
              size="large"
              loading={submitting || bootstrapping}
              onClick={() => {
                void handleLogin();
              }}
            >
              登录管理台
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
};
