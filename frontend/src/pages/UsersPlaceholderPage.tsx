import { Alert, Button, Card, List, Space, Tag, Typography } from '@arco-design/web-react';

const pendingModules = [
  '网站管理员账号体系',
  '社区负责人角色权限',
  '玩家个人中心与白名单申请入口',
  '登录、鉴权与操作日志',
];

export const UsersPlaceholderPage = () => {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <div>
        <Typography.Title heading={4} style={{ marginBottom: 8 }}>
          网站用户
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          该模块已预留入口，后续会承载管理员、社区负责人、玩家账号与权限体系。
        </Typography.Paragraph>
      </div>

      <Alert type="warning" showIcon content="网站用户模块暂未开发，本页面用于承接后续迭代规划。" />

      <Card title="后续规划">
        <List
          dataSource={pendingModules}
          render={(item, index) => (
            <List.Item key={item}>
              <Space>
                <Tag color="purple">TODO {index + 1}</Tag>
                <Typography.Text>{item}</Typography.Text>
              </Space>
            </List.Item>
          )}
        />
      </Card>

      <Card title="当前建议">
        <Space direction="vertical" size="medium">
          <Typography.Text>建议下一步优先实现网站用户登录与角色权限，便于将社区管理和白名单审核与真实管理员绑定。</Typography.Text>
          <Button type="primary" disabled>
            待开发
          </Button>
        </Space>
      </Card>
    </Space>
  );
};
