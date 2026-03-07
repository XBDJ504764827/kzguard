import { Button, Card, Switch, Tag, Typography } from '@arco-design/web-react';
import { IconBulb, IconCheckCircle, IconLock, IconPoweroff } from '@arco-design/web-react/icon';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../contexts/AppStoreContext';

const publicRoutes = [
  { key: '/public/whitelist/apply', label: '白名单申请', icon: <IconCheckCircle /> },
  { key: '/public/whitelist', label: '白名单公示', icon: <IconCheckCircle /> },
  { key: '/public/bans', label: '封禁公示', icon: <IconLock /> },
];

export const PublicLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, isAuthenticated } = useAppStore();

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-brand">
          <div className="public-header-brand-wrap">
            <div className="brand-mark">KZ</div>
            <div className="public-header-copy">
              <Typography.Title heading={5} className="public-header-title">
                KZ Guard 玩家服务
              </Typography.Title>
              <Typography.Text type="secondary" className="public-header-subtitle">
                无需登录即可查询封禁、白名单状态并提交申请
              </Typography.Text>
            </div>
          </div>
        </div>

        <div className="public-header-actions">
          <div className="public-nav-strip">
            {publicRoutes.map((route) => (
              <Button
                key={route.key}
                type={location.pathname === route.key ? 'primary' : 'text'}
                icon={route.icon}
                onClick={() => navigate(route.key)}
              >
                {route.label}
              </Button>
            ))}
          </div>

          <div className="public-header-controls">
            <div className="header-theme-chip">
              <IconBulb />
              <Typography.Text>{theme === 'dark' ? '深色模式' : '浅色模式'}</Typography.Text>
            </div>
            <Switch
              checked={theme === 'dark'}
              checkedText="Dark"
              uncheckedText="Light"
              onChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
            <Button
              type={isAuthenticated ? 'primary' : 'outline'}
              icon={isAuthenticated ? <IconPoweroff /> : undefined}
              onClick={() => navigate(isAuthenticated ? '/' : '/login')}
            >
              {isAuthenticated ? '进入管理台' : '管理员登录'}
            </Button>
          </div>
        </div>
      </header>

      <div className="public-hero">
        <Card className="public-hero-card">
          <div className="page-header-stack">
            <div className="toolbar-action-group">
              <Tag color="green">公开页面</Tag>
              <Tag color="arcoblue">Steam 自动识别</Tag>
              <Tag color="purple">支持搜索</Tag>
            </div>
            <Typography.Title heading={4} style={{ marginBottom: 0 }}>
              玩家可在这里提交白名单申请，或按 SteamID / 游戏名称查询封禁与白名单状态
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              白名单申请会自动解析 Steam 标识并查询游戏名称；封禁公示与白名单公示支持公开检索，无需登录。
            </Typography.Paragraph>
          </div>
        </Card>
      </div>

      <main className="content-shell">
        <Outlet />
      </main>
    </div>
  );
};
