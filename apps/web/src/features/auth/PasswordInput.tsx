import { Eye, EyeOff } from '@/components/ui/icons';
import { type ComponentProps, useState } from 'react';
import { IconButton, Input } from '@/components/ui';
import { useT } from '@/i18n';

type PasswordInputProps = Omit<ComponentProps<typeof Input>, 'type' | 'trailing'>;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const t = useT();
  return (
    <Input
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <IconButton
          icon={visible ? EyeOff : Eye}
          label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        />
      }
    />
  );
}
