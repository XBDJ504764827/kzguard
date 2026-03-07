import { Avatar, Button, Layout, Menu, Switch, Tag, Typography } from '@arco-design/web-react';
import {
  IconApps,
  IconBulb,
  IconCheckCircle,
  IconDashboard,
  IconDriveFile,
  IconLock,
  IconMenuFold,
  IconMenuUnfold,
  IconPoweroff,
  IconUser,
} from '@arco-design/web-react/icon';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useAppStore } from '../contexts/AppStoreContext';
import { websiteAdminRoleColorMap, websiteAdminRoleLabelMap } from '../utils/websiteAdmin';

const menuEntries = [
  { key: '/', label: '概览', icon: <IconDashboard /> },
  { key: '/communities', label: '社区组管理', icon: <IconApps /> },
  { key: '/whitelist', label: '白名单管理', icon: <IconCheckCircle /> },
  { key: '/bans', label: '封禁管理', icon: <IconLock /> },
  { key: '/users', label: '网站用户', icon: <IconUser /> },
  { key: '/operation-logs', label: '操作日志', icon: <IconDriveFile /> },
];

export const AppLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, apiMode, currentAdmin, logout } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  const selectedKey = useMemo(() => {
    const currentEntry = menuEntries.find((entry) =>
      entry.key === '/' ? location.pathname === '/' : location.pathname.startsWith(entry.key),
    );

    return currentEntry?.key ?? '/';
  }, [location.pathname]);

  return (
    <Layout className="app-shell">
      <Layout.Sider collapsed={collapsed} width={248} collapsedWidth={72} className="app-sider">
        <div className="brand-shell">
          <div className="brand-mark">KZ</div>
          {!collapsed ? (
            <div>
              <Typography.Title heading={5} style={{ marginBottom: 4 }}>
                KZ Guard
              </Typography.Title>
              <Typography.Text type="secondary">CSGO 社区服控制台</Typography.Text>
            </div>
          ) : null}
        </div>

        <Menu
          selectedKeys={[selectedKey]}
          onClickMenuItem={(key) => navigate(key)}
          theme={theme === 'dark' ? 'dark' : 'light'}
          style={{ border: 'none', background: 'transparent' }}
        >
          {menuEntries.map((entry) => (
            <Menu.Item key={entry.key}>
              <div className="sider-entry">
                <span className="sider-entry-icon">{entry.icon}</span>
                {!collapsed ? <span>{entry.label}</span> : null}
              </div>
            </Menu.Item>
          ))}
        </Menu>
      </Layout.Sider>

      <Layout>
        <Layout.Header className="app-header">
          <div className="app-header-main">
            <Button
              type="text"
              icon={collapsed ? <IconMenuUnfold /> : <IconMenuFold />}
              onClick={() => setCollapsed((currentValue) => !currentValue)}
            />

            <div className="app-header-title-group">
              <Typography.Title heading={5} className="app-header-title">
                KZ Guard 管理台
              </Typography.Title>
              <div className="app-header-meta">
                <Tag color="green">Rust 后端</Tag>
                <Tag color={apiMode === 'http' ? 'green' : 'orange'}>{apiMode === 'http' ? 'HTTP API' : 'Mock API'}</Tag>
              </div>
            </div>
          </div>

          <div className="app-header-actions">
            {currentAdmin ? (
              <div className="header-user-chip">
                <Tag color={websiteAdminRoleColorMap[currentAdmin.role]}>
                  {websiteAdminRoleLabelMap[currentAdmin.role]}
                </Tag>
                <Typography.Text ellipsis className="header-user-name">
                  {currentAdmin.displayName}
                </Typography.Text>
              </div>
            ) : null}

            <div className="app-header-control-row">
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
                type="outline"
                size="small"
                icon={<IconPoweroff />}
                onClick={() => {
                  void logout();
                }}
              >
                退出登录
              </Button>
              <Avatar style={{ backgroundColor: '#165dff', flexShrink: 0 }}>
                {currentAdmin?.displayName.slice(0, 1) ?? 'K'}
              </Avatar>
            </div>
          </div>
        </Layout.Header>

        <Layout.Content className="content-shell">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
};
