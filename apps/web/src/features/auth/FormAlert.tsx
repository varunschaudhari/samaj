import { CircleAlert } from '@/components/ui/icons';
import { Icon } from '@/components/ui';

/** A form-level error, announced when it appears. */
export function FormAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-sm bg-danger-soft px-3 py-2.5 text-sm text-danger">
      <Icon icon={CircleAlert} className="mt-0.5" />
      <p>{message}</p>
    </div>
  );
}
