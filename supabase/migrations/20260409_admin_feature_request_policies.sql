-- Allow admin to update, insert, and delete any feature request

CREATE POLICY "Admin can update any feature request"
ON public.feature_requests
FOR UPDATE
USING (auth.email() = 'milo.cosemans@gmail.com')
WITH CHECK (auth.email() = 'milo.cosemans@gmail.com');

CREATE POLICY "Admin can insert feature requests"
ON public.feature_requests
FOR INSERT
WITH CHECK (auth.email() = 'milo.cosemans@gmail.com');

CREATE POLICY "Admin can delete any feature request"
ON public.feature_requests
FOR DELETE
USING (auth.email() = 'milo.cosemans@gmail.com');

-- Also allow admin to delete votes (needed for delete cascade)
CREATE POLICY "Admin can delete any feature request vote"
ON public.feature_request_votes
FOR DELETE
USING (auth.email() = 'milo.cosemans@gmail.com');
